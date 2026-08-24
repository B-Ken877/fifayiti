import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * POST /api/livekit-room
 *
 * Updates the LiveKit room metadata. Room metadata survives participant
 * disconnects — so if the operator leaves, the selectedSlot + matchData
 * are still available for viewers.
 *
 * Body: { roomName, metadata }
 *
 * Robustness (live retransmission fix):
 *   1. The broadcast state is ALSO persisted to `db/broadcast-state.json`
 *      so it survives LiveKit idle-room deletion (LiveKit deletes a room
 *      shortly after the last participant leaves).
 *   2. If the room no longer exists, `updateRoomMetadata` fails with a
 *      twirp 404 ("requested room does not exist"). We used to surface
 *      that as a 500 — which silently dropped the operator's "go live"
 *      selection and left TV viewers with no video. Now we re-create
 *      the room (with the metadata) instead.
 */

const API_KEY = "medikakey";
const API_SECRET = "7GD6FdL2cP9KTmTLkJVUKNj7XfJjWAMS";
const LIVEKIT_URL = "http://127.0.0.1:7880";

const roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);

// Persisted broadcast state — mirrors the LiveKit room metadata.
// NOTE: in standalone production mode, server.js chdir's into
// `.next/standalone`, so process.cwd() is NOT the project root there.
// Resolve the real root (2 levels up from .next/standalone) so the file
// lives in <project>/db/ and survives rebuilds.
const cwd = process.cwd();
const PROJECT_ROOT = cwd.endsWith(path.join(".next", "standalone"))
  ? path.resolve(cwd, "..", "..")
  : cwd;
const STATE_FILE = path.join(PROJECT_ROOT, "db", "broadcast-state.json");

async function readPersistedState(): Promise<any | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed?.metadata ?? null;
  } catch {
    return null;
  }
}

async function writePersistedState(metadata: any): Promise<void> {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ metadata, savedAt: new Date().toISOString() }, null, 2)
    );
  } catch (e: any) {
    console.warn("[livekit-room] could not persist broadcast state:", e?.message);
  }
}

function isRoomMissingError(e: any): boolean {
  const msg = String(e?.message ?? e?.protoMessage ?? "");
  return (
    e?.status === 404 ||
    e?.code === "not_found" ||
    msg.includes("does not exist") ||
    msg.includes("not found")
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const roomName = body.roomName || "fifayiti-broadcast";
    const metadata = body.metadata ?? "";

    // 1. Always persist to disk first — cheap and survives room deletion.
    await writePersistedState(metadata);

    // 2. Update the LiveKit room metadata. If the room was idle-deleted,
    //    re-create it with the metadata (1h empty timeout) so the call
    //    cannot 404 and the operator's selection is never lost.
    try {
      await roomService.updateRoomMetadata(roomName, JSON.stringify(metadata));
    } catch (e: any) {
      if (isRoomMissingError(e)) {
        try {
          await roomService.createRoom({
            name: roomName,
            metadata: JSON.stringify(metadata),
            emptyTimeout: 3600,
          });
        } catch (e2: any) {
          // Disk state is already saved — not fatal, but log it.
          console.error(
            "[livekit-room] room re-creation failed:",
            e2?.message ?? e2
          );
        }
      } else {
        console.error("[livekit-room] POST error:", e);
      }
    }

    return NextResponse.json({ ok: true, roomName, metadata });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get("roomName") || "fifayiti-broadcast";

    let room: any = null;
    // Whether we could successfully enumerate participants, and whether at
    // least one cameraman is currently connected.
    let participantsChecked = false;
    let cameramanOnline = false;
    try {
      const rooms = await roomService.listRooms();
      room = rooms.find((r: any) => r.name === roomName) ?? null;
      if (room) {
        try {
          const participants = await roomService.listParticipants(roomName);
          cameramanOnline = participants.some((p: any) => {
            try {
              const meta = p.metadata ? JSON.parse(p.metadata) : {};
              return meta.role === "cameraman" || !!meta.slot;
            } catch {
              return false;
            }
          });
          participantsChecked = true;
        } catch (e: any) {
          console.error("[livekit-room] listParticipants error:", e?.message);
        }
      }
    } catch (e: any) {
      // LiveKit unreachable — fall back to persisted state below.
      console.error("[livekit-room] listRooms error:", e?.message);
    }

    // Resolve metadata: live room metadata first, persisted state as fallback.
    let metadata: any = null;
    if (room) {
      try {
        metadata = room.metadata ? JSON.parse(room.metadata) : null;
      } catch {
        metadata = room.metadata || null;
      }
    }
    if (metadata == null) {
      metadata = await readPersistedState();
    }

    // ── Phantom-live guard ──
    // If the saved state says a slot is on air but NO cameraman is connected
    // (room idle-deleted, or everyone left without clearing the state), force
    // the slot off. Viewers must never see "AN DIRÈK" with no video.
    //   - Room missing  → zero participants → definitely off.
    //   - Participants enumerated and no cameraman found → off.
    //   - Enumeration failed → keep saved state (avoid false negatives).
    const broadcastImpossible =
      !room || (participantsChecked && !cameramanOnline);
    if (metadata && metadata.selectedSlot != null && broadcastImpossible) {
      metadata = { ...metadata, selectedSlot: null };
    }

    return NextResponse.json({
      exists: !!room,
      metadata,
      numParticipants: room?.numParticipants ?? 0,
    });
  } catch (e: any) {
    // Last-resort fallback: serve persisted state rather than a 500, so
    // the TV page keeps working through transient LiveKit issues.
    const saved = await readPersistedState().catch(() => null);
    if (saved !== null) {
      return NextResponse.json({
        exists: false,
        metadata: { ...saved, selectedSlot: null },
        numParticipants: 0,
      });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

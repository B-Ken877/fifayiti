// FIFAYITI Broadcast State Pusher (server-side).
//
// THE PROBLEM THIS SOLVES:
//   The TV scorebug/overlay reads the LiveKit ROOM metadata (polled every
//   2s via GET /api/livekit-room). But the operator's actual work —
//   confirming events (GÒL, kat jòn…), starting/pausing the clock — only
//   wrote to the database. NOTHING propagated it to the room metadata,
//   so the TV stayed stale until someone manually pressed "VOYE SOU TV"
//   on the broadcast control page (which itself pushed a STALE snapshot).
//   On Vercel the interim file-based state (db/broadcast-overlay.json,
//   db/match-clock-state.json) could not even be written (read-only FS).
//
// THE FIX:
//   Every operator action (events + phase/clock routes) now calls
//   pushBroadcastMatchUpdate() fire-and-forget. It rebuilds a FRESH
//   matchData payload from the database and merges it into the LiveKit
//   room metadata (the one store that is global across serverless
//   instances AND survives participant disconnects). Viewers' TVs then
//   reflect the new score/clock/overlay within their 2s poll.
//
// Clock accuracy without server filesystem:
//   matchData carries { clock, clockEpoch (ms), running }. GET
//   /api/livekit-room interpolates: liveClock = clock + (now-epoch)/1000
//   while running — accurate between the operator tab's 5s tick syncs
//   and works identically on Vercel and the sandbox.

import { RoomServiceClient } from "livekit-server-sdk";
import { db } from "@/lib/db";
import {
  LIVEKIT_API_KEY as API_KEY,
  LIVEKIT_API_SECRET as API_SECRET,
  LIVEKIT_URL,
} from "@/lib/streaming/livekit-config";

export const BROADCAST_ROOM = "fifayiti-broadcast";

const roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);

export interface BroadcastMatchData {
  matchId: string;
  homeShort: string;
  homeColor: string;
  awayShort: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  clock: number;
  half: string;
  status?: string;
  /** wall-clock ms when `clock` was captured — enables live interpolation */
  clockEpoch?: number;
  /** whether the clock is advancing (match live, half 1 or 2) */
  running?: boolean;
}

/** Build a fresh scorebug payload for a match straight from the database. */
export async function buildMatchDataFromDb(
  matchId: string
): Promise<BroadcastMatchData | null> {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) return null;
  const [home, away] = await Promise.all([
    db.team.findUnique({ where: { id: match.homeTeamId } }),
    db.team.findUnique({ where: { id: match.awayTeamId } }),
  ]);
  const running = match.status === "AN_DIRÈK" && (match.half === "1" || match.half === "2");
  return {
    matchId: match.id,
    homeShort: home?.shortName ?? "HOM",
    homeColor: home?.primaryColor ?? "#116B3A",
    awayShort: away?.shortName ?? "AWY",
    awayColor: away?.primaryColor ?? "#667085",
    homeScore: match.homeScore ?? 0,
    awayScore: match.awayScore ?? 0,
    clock: match.clock ?? 0,
    half: match.half ?? "PRE",
    status: match.status,
    clockEpoch: Date.now(),
    running,
  };
}

async function getRoomMetadata(): Promise<{ roomExists: boolean; metadata: any }> {
  try {
    const rooms = await roomService.listRooms();
    const room = rooms.find((r: any) => r.name === BROADCAST_ROOM);
    if (!room) return { roomExists: false, metadata: null };
    try {
      return { roomExists: true, metadata: room.metadata ? JSON.parse(room.metadata) : null };
    } catch {
      return { roomExists: true, metadata: null };
    }
  } catch {
    return { roomExists: false, metadata: null };
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

export interface PushOptions {
  /** broadcast overlay event (GÒL / kat jòn …) to attach for ~10s */
  overlay?: any;
}

/**
 * Merge a fresh matchData (and optional overlay) into the broadcast room
 * metadata. Fire-and-forget safe: never throws to the caller's critical
 * path — returns true when the push reached LiveKit.
 *
 * Guard: if the room currently shows a DIFFERENT match, we do not
 * overwrite it (an unrelated match's phase tick must not hijack the TV).
 */
export async function pushBroadcastMatchUpdate(
  matchId: string,
  opts: PushOptions = {}
): Promise<boolean> {
  try {
    const fresh = await buildMatchDataFromDb(matchId);
    if (!fresh) return false;

    const { roomExists, metadata } = await getRoomMetadata();
    const currentMatchId = metadata?.matchData?.matchId ?? null;
    if (currentMatchId && currentMatchId !== matchId) {
      // A different match is on air — leave it alone.
      return false;
    }

    const merged: any = { ...(metadata ?? {}) };
    // Preserve the operator's camera selection (or clear it if none was
    // ever set AND no camera is expected — never touch it here otherwise).
    merged.matchData = fresh;
    if (metadata?.selectedSlot !== undefined) merged.selectedSlot = metadata.selectedSlot;
    if (opts.overlay) merged.overlay = opts.overlay;

    const payload = JSON.stringify(merged);
    try {
      await roomService.updateRoomMetadata(BROADCAST_ROOM, payload);
    } catch (e: any) {
      if (isRoomMissingError(e)) {
        // Room idle-deleted — recreate it carrying the metadata so the
        // scorebug/overlay still reach viewers when cameras reconnect.
        try {
          await roomService.createRoom({
            name: BROADCAST_ROOM,
            metadata: payload,
            emptyTimeout: 3600,
          });
        } catch {
          return false;
        }
      } else {
        throw e;
      }
    }
    return true;
  } catch (e: any) {
    console.warn("[broadcast-state] push failed:", e?.message ?? e);
    return false;
  }
}

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
  /** Score delta to apply to the CURRENT LiveKit metadata (not DB).
   *  e.g. { home: 1, away: 0 } for a home GOL. */
  scoreDelta?: { home: number; away: number };
  /** Clock delta (seconds) to apply to the CURRENT LiveKit metadata. */
  clockDelta?: number;
  /** Force-set the clock (overrides delta). Used by start/half_time/second_half. */
  forceClock?: number;
  /** Force-set the half (overrides delta). */
  forceHalf?: string;
  /** Force-set the match status. */
  forceStatus?: string;
}

/**
 * Merge a matchData update into the broadcast room metadata.
 *
 * ARCHITECTURE (Vercel serverless):
 *   On Vercel each lambda gets a FRESH copy of prisma/dev.db. Writes in
 *   one lambda are invisible to the next. If we read score/clock from the
 *   DB and pushed that, a clock tick on Lambda B (which starts with the
 *   stale committed DB score=0) would OVERWRITE a GOL that Lambda A just
 *   pushed (score=1). The TV would never show the updated score.
 *
 *   FIX: the LiveKit room metadata is the SOURCE OF TRUTH for the live
 *   score/clock — it is shared across all lambdas and survives participant
 *   disconnects. We read the current matchData from LiveKit, apply deltas
 *   (scoreDelta / clockDelta / force* fields), and push the result back.
 *   The DB writes still happen (for the events archive) but they are NOT
 *   read here.
 *
 *   Team names/colors ARE read from the DB (they don't change during a
 *   match, so the ephemeral DB copy is fine for that).
 *
 * Guard: if the room currently shows a DIFFERENT match, we do not
 * overwrite it (an unrelated match's phase tick must not hijack the TV).
 */
export async function pushBroadcastMatchUpdate(
  matchId: string,
  opts: PushOptions = {}
): Promise<boolean> {
  try {
    const { roomExists, metadata } = await getRoomMetadata();
    const currentMatchId = metadata?.matchData?.matchId ?? null;
    if (currentMatchId && currentMatchId !== matchId) {
      // A different match is on air — leave it alone.
      return false;
    }

    // ── Start from the CURRENT LiveKit matchData (NOT the DB) ──
    // This is the fix for the lambda race condition: the score/clock
    // live in LiveKit metadata (shared across all lambdas), not in the
    // ephemeral /tmp DB copy.
    const current: any = metadata?.matchData ?? {};

    const updated: any = {
      matchId,
      homeShort: current.homeShort,
      homeColor: current.homeColor,
      awayShort: current.awayShort,
      awayColor: current.awayColor,
      homeScore: current.homeScore ?? 0,
      awayScore: current.awayScore ?? 0,
      clock: current.clock ?? 0,
      half: current.half ?? "PRE",
      status: current.status ?? "PWOGRAM",
      clockEpoch: Date.now(),
    };

    // ── Apply score delta ──
    if (opts.scoreDelta) {
      updated.homeScore = (current.homeScore ?? 0) + opts.scoreDelta.home;
      updated.awayScore = (current.awayScore ?? 0) + opts.scoreDelta.away;
    }

    // ── Apply clock delta ──
    if (opts.clockDelta) {
      updated.clock = (current.clock ?? 0) + opts.clockDelta;
    }

    // ── Apply forced values (override deltas) ──
    if (opts.forceClock !== undefined) updated.clock = opts.forceClock;
    if (opts.forceHalf !== undefined) updated.half = opts.forceHalf;
    if (opts.forceStatus !== undefined) updated.status = opts.forceStatus;

    // ── Running state (drives clock interpolation on the TV) ──
    updated.running =
      updated.status === "AN_DIRÈK" &&
      (updated.half === "1" || updated.half === "2");

    // ── Team info from DB (safe — doesn't change during a match) ──
    // Only fetch if we don't already have it in the LiveKit metadata.
    if (!updated.homeShort || !updated.awayShort) {
      try {
        const dbData = await buildMatchDataFromDb(matchId);
        if (dbData) {
          if (!updated.homeShort) {
            updated.homeShort = dbData.homeShort;
            updated.homeColor = dbData.homeColor;
          }
          if (!updated.awayShort) {
            updated.awayShort = dbData.awayShort;
            updated.awayColor = dbData.awayColor;
          }
        }
      } catch {}
    }

    const merged: any = { ...(metadata ?? {}) };
    merged.matchData = updated;
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

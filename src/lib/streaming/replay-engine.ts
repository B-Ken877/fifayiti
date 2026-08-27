// FIFAYITI Instant Replay Engine — Vercel + LiveKit Cloud edition.
//
// Turns an operator event (GOL today; cards/saves tomorrow) into an
// automatic BROADCAST REPLAY:
//
//   operator confirms GOL  →  POST /api/matches/[id]/events
//        ↓ (fire-and-forget — the event/score/overlay path never waits)
//   triggerBroadcastReplay()
//        ├── 1. create the durable Replay archive row (Prisma)
//        ├── 2. publish replay-broadcast state (best-effort file — sandbox;
//        │      silently skipped on read-only serverless FS)
//        └── 3. LiveKit RoomService.sendData → every connected viewer
//               receives it in ~100-300ms and runs the local sequence:
//                 5s before the marker at 1×  →  same clip at 0.5×  →  LIVE
//
// WHY CLIENT-SIDE: on LiveKit Cloud there is no server-reachable HLS disk
// (egress writes to the project's object storage, not to Vercel), and
// serverless functions cannot run ffmpeg anyway. Each viewer's browser
// keeps a rolling buffer of the PROGRAM FEED it is watching (the
// operator-selected camera, switches included) — which also guarantees
// the replay is exactly what the audience saw.
//
// PRINCIPLE: the live broadcast NEVER depends on this succeeding. Every
// step is wrapped; on failure we log and leave the live stream untouched.

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";

import { db } from "@/lib/db";
import {
  LIVEKIT_API_KEY as API_KEY,
  LIVEKIT_API_SECRET as API_SECRET,
  LIVEKIT_URL,
} from "@/lib/streaming/livekit-config";
import {
  DEFAULT_REPLAY_WINDOW,
  estimateTotalMs,
  type ReplayWindowConfig,
} from "@/lib/replay/replay-sequence";

const ROOM_NAME = "fifayiti-broadcast";

const PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  return cwd.endsWith(path.join(".next", "standalone"))
    ? path.resolve(cwd, "..", "..")
    : cwd;
})();
const REPLAY_STATE_FILE = path.join(PROJECT_ROOT, "db", "replay-broadcast.json");

// Event kinds that trigger a broadcast replay (extendable: SAV, BIG_CHANCE…)
const REPLAY_KINDS: string[] = ["GOL", "FOT", "KAT_JON", "KAT_WOUJ"];

// MatchEventKind → ReplayKind (display taxonomy for the archive)
const REPLAY_KIND_MAP: Record<string, "GOL" | "SAV" | "KAT"> = {
  GOL: "GOL",
  FOT: "SAV",
  KAT_JON: "KAT",
  KAT_WOUJ: "KAT",
};

// In-process lock so rapid consecutive triggers can't corrupt each other.
// (Serverless note: lambdas don't share memory — the CLIENT engine is the
// final arbiter and rejects a replay that arrives while one is playing.)
let replayInFlight = false;

export interface ReplayTrigger {
  kind: string; // "GOL"
  matchId?: string;
  eventId?: string;
  teamId?: string | null;
  playerInId?: string | null;
  description?: string;
  minute?: number;
}

export interface BroadcastReplayState {
  active: boolean;
  url: string | null; // server-side clip URL (Cloud v1: none — client buffer)
  kind: string | null;
  replayId: string | null;
  startedAt: number | null;
  endsAt: number | null; // safety net — players also return on their own
  durationMs: number | null;
  transport: "data-channel" | "clip";
}

// ────────────────────────────────────────────────────────────────────────
// The replay engine
// ────────────────────────────────────────────────────────────────────────
export async function triggerBroadcastReplay(
  trigger: ReplayTrigger,
  windowConfig: ReplayWindowConfig = DEFAULT_REPLAY_WINDOW
): Promise<{ ok: boolean; reason?: string; replayId?: string }> {
  if (!REPLAY_KINDS.includes(trigger.kind)) {
    return { ok: false, reason: `kind ${trigger.kind} does not trigger replay` };
  }
  if (replayInFlight) {
    // Policy (v1): safely REJECT a second replay while one is running.
    // The GOL event itself is already recorded — only the replay is skipped.
    console.log(`[replay-engine] busy — trigger rejected (kind=${trigger.kind})`);
    return { ok: false, reason: "replay already in progress" };
  }
  // Honor a still-active state from a previous process (sandbox/self-host).
  const existing = await readBroadcastState();
  if (existing?.active && existing.endsAt && existing.endsAt > Date.now()) {
    console.log("[replay-engine] broadcast replay still active — trigger rejected");
    return { ok: false, reason: "replay already in progress" };
  }

  replayInFlight = true;
  try {
    return await runReplay(trigger, windowConfig);
  } catch (e: any) {
    console.error("[replay-engine] FAILED — live broadcast continues:", e?.message ?? e);
    await clearBroadcastState().catch(() => {});
    return { ok: false, reason: e?.message ?? "replay generation failed" };
  } finally {
    replayInFlight = false;
  }
}

async function runReplay(trigger: ReplayTrigger, cfg: ReplayWindowConfig) {
  const markerWall = Date.now();
  const estimatedMs = estimateTotalMs(cfg);

  // ── 1. Durable archive record (match / team / player / timeline) ────
  // The row carries the DVR coordinates (triggeredAt + preRoll) so a
  // standalone clip can be materialized later from the egress recording
  // once object storage is wired (mediaRef stays null until then).
  let replayId: string | undefined;
  if (trigger.matchId) {
    try {
      const minute = trigger.minute ?? 0;
      const row = await db.replay.create({
        data: {
          matchId: trigger.matchId,
          title: trigger.description?.slice(0, 200) || `${trigger.kind} ${minute}'`,
          kind: REPLAY_KIND_MAP[trigger.kind] ?? "GOL",
          minute,
          playerId: trigger.playerInId ?? null,
          teamId: trigger.teamId ?? null,
          eventId: trigger.eventId ?? null,
          status: "PUBLISHED",
          triggeredAt: new Date(markerWall),
          preRollMs: Math.round(cfg.preRollSec * 1000),
          slowMotionRate: cfg.slowMotionRate,
          sequenceMs: estimatedMs,
          thumbnail: "",
          permanent: true,
        },
      });
      replayId = row.id;
    } catch (e: any) {
      // Archive failure must not stop the live broadcast replay.
      console.warn("[replay-engine] archive row failed:", e?.message);
    }
  }

  // ── 2. Publish viewer-facing state (best-effort; serverless FS is
  //       read-only — the data channel below is the primary transport) ──
  const endsAt = markerWall + estimatedMs + 5000; // generous safety margin
  const state: BroadcastReplayState = {
    active: true,
    url: null,
    kind: trigger.kind,
    replayId: replayId ?? null,
    startedAt: markerWall,
    endsAt,
    durationMs: estimatedMs,
    transport: "data-channel",
  };
  await writeBroadcastState(state).catch(() => {});

  // ── 3. Push the replay event to every viewer over the LiveKit data
  //       channel — instant, no polling latency, works on Cloud. ────────
  const message = {
    v: 1,
    type: "instant-replay",
    replayId: replayId ?? `live-${markerWall}`,
    kind: trigger.kind,
    minute: trigger.minute ?? null,
    preRollMs: Math.round(cfg.preRollSec * 1000),
    slowMotionRate: cfg.slowMotionRate,
    transportGuardMs: Math.round(cfg.transportGuardSec * 1000),
    triggeredAt: markerWall,
    endsAt,
  };
  try {
    const rs = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    await rs.sendData(
      ROOM_NAME,
      new TextEncoder().encode(JSON.stringify(message)),
      DataPacket_Kind.RELIABLE
    );
  } catch (e: any) {
    // Room empty/missing → nobody to show a replay to; not an error worth
    // failing over. Late-joiner state + archive row already exist.
    console.warn("[replay-engine] data-channel send skipped:", e?.message);
  }

  console.log(
    `[replay-engine] BROADCAST REPLAY out: kind=${trigger.kind} minute=${trigger.minute ?? "?"}` +
      ` (${cfg.preRollSec}s normal + ${(cfg.preRollSec / cfg.slowMotionRate).toFixed(1)}s slow-mo ≈ ${estimatedMs}ms)`
  );

  return { ok: true, replayId };
}

// ────────────────────────────────────────────────────────────────────────
// Broadcast replay state (viewer-facing poll — late joiners / HLS path)
// ────────────────────────────────────────────────────────────────────────
export async function readBroadcastState(): Promise<BroadcastReplayState> {
  try {
    const raw = JSON.parse(await readFile(REPLAY_STATE_FILE, "utf-8"));
    if (raw?.active && raw.endsAt && Date.now() > raw.endsAt) {
      await clearBroadcastState();
      return inactive();
    }
    return raw ?? inactive();
  } catch {
    return inactive();
  }
}

async function writeBroadcastState(s: BroadcastReplayState): Promise<void> {
  try {
    const dir = path.dirname(REPLAY_STATE_FILE);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(REPLAY_STATE_FILE, JSON.stringify(s, null, 2));
  } catch {
    // Read-only FS (Vercel) — the data channel is the primary transport.
    console.warn("[replay-engine] state file not persisted (serverless FS) — data channel used");
  }
}

async function clearBroadcastState(): Promise<void> {
  try {
    await writeFile(REPLAY_STATE_FILE, JSON.stringify(inactive(), null, 2));
  } catch {}
}

function inactive(): BroadcastReplayState {
  return {
    active: false, url: null, kind: null, replayId: null,
    startedAt: null, endsAt: null, durationMs: null, transport: "data-channel",
  };
}

// ────────────────────────────────────────────────────────────────────────
// Replay archive (match Replay section) — Prisma-backed
// ────────────────────────────────────────────────────────────────────────
export async function listReplays(matchId?: string): Promise<any[]> {
  try {
    const rows = await db.replay.findMany({
      where: matchId ? { matchId } : undefined,
      orderBy: { triggeredAt: "desc" },
      take: 200,
      include: { team: true, player: true },
    });
    return rows.map((r: any) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      minute: r.minute,
      matchId: r.matchId,
      teamId: r.teamId,
      teamName: r.team?.name ?? null,
      playerName: r.player ? `${r.player.firstName} ${r.player.lastName}` : null,
      triggeredAt: r.triggeredAt?.toISOString?.() ?? null,
      savedAt: r.savedAt?.toISOString?.() ?? null,
      preRollMs: r.preRollMs,
      slowMotionRate: r.slowMotionRate,
      sequenceMs: r.sequenceMs,
      status: r.status,
      // No standalone clip yet (needs object storage) — the broadcast
      // replay itself is delivered live over the data channel.
      url: null,
      available: false,
    }));
  } catch (e: any) {
    console.warn("[replay-engine] listReplays failed:", e?.message);
    return [];
  }
}

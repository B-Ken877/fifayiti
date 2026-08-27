// FIFAYITI Instant Replay — pure sequence/timing logic (no DOM, no I/O).
//
// Shared by BOTH delivery paths so the broadcast always behaves identically:
//   • WebRTC path  — client-side rolling buffer (client-replay-engine.ts)
//   • HLS/DVR path — seek-based replay inside BroadcastPlayer
//
// The clip window is anchored to the OPERATOR MARKER (per spec: the 5
// seconds immediately preceding the marker — the operator IS the event
// timestamp; a late press is fine by design). Configurable window so
// PRE_ROLL/POST_ROLL can evolve later without touching the engines.

export interface ReplayWindowConfig {
  /** Seconds of footage before the marker. v1: exactly 5. */
  preRollSec: number;
  /** Marker→broadcast delay absorbed at the client (transport guard). v1: 0.35. */
  transportGuardSec: number;
  /** Slow-motion pass playback rate. v1: exactly 0.5. */
  slowMotionRate: number;
  /** Below this much available footage the replay is skipped gracefully. */
  minClipSec: number;
}

export const DEFAULT_REPLAY_WINDOW: ReplayWindowConfig = {
  preRollSec: 5,
  transportGuardSec: 0.35,
  slowMotionRate: 0.5,
  minClipSec: 2,
};

export type ReplayPhase =
  | "idle" // live
  | "arming" // sealing the clip from the buffer (sub-second)
  | "normal" // pass 1 — clip at 1× (≈5s wall)
  | "slowmo" // pass 2 — same clip at 0.5× (≈10s wall)
  | "returning"; // back to the live edge

export interface ReplayPlan {
  ok: boolean;
  reason?: string;
  /** Media-time where the clip starts (relative to the recording). */
  clipStart: number;
  /** Media-time where the clip ends (the marker). */
  clipEnd: number;
  clipSec: number;
  /** Expected wall-clock durations of each pass (ms). */
  normalMs: number;
  slowMs: number;
  totalMs: number;
}

/**
 * Compute the replay plan from the available recording.
 *
 * @param availableSec  how much footage exists (buffer/DVR duration)
 * @param config        the replay window config
 *
 * The clip end is `availableSec - transportGuardSec`: the buffer keeps
 * recording past the marker, and the guard absorbs operator→server→viewer
 * transport latency so the clip ends AT the marker, not after it.
 */
export function planReplay(availableSec: number, config: ReplayWindowConfig = DEFAULT_REPLAY_WINDOW): ReplayPlan {
  const fail = (reason: string): ReplayPlan => ({
    ok: false, reason, clipStart: 0, clipEnd: 0, clipSec: 0,
    normalMs: 0, slowMs: 0, totalMs: 0,
  });

  if (!isFinite(availableSec) || availableSec <= 0) return fail("no footage recorded");
  if (config.slowMotionRate <= 0 || config.slowMotionRate > 1) return fail("invalid slow-motion rate");

  // The marker sits `transportGuardSec` before the (still-growing) end.
  const marker = availableSec - config.transportGuardSec;
  const clipEnd = Math.max(0, marker);
  const clipStart = Math.max(0, clipEnd - config.preRollSec);
  const clipSec = clipEnd - clipStart;

  if (clipSec < config.minClipSec) {
    // e.g. GOL pressed seconds after the broadcast started. Fail
    // gracefully — the live stream must never depend on the replay.
    return fail(`not enough footage (${clipSec.toFixed(1)}s < ${config.minClipSec}s)`);
  }

  const normalMs = Math.round(clipSec * 1000);
  const slowMs = Math.round((clipSec / config.slowMotionRate) * 1000);
  return {
    ok: true,
    clipStart,
    clipEnd,
    clipSec,
    normalMs,
    slowMs,
    totalMs: normalMs + slowMs,
  };
}

/** Which pass should be active at a given media position + rate? */
export function nextPhase(
  current: ReplayPhase,
  currentTime: number,
  plan: ReplayPlan
): ReplayPhase {
  if (current === "normal" && currentTime >= plan.clipEnd - 0.05) return "slowmo";
  if (current === "slowmo" && currentTime >= plan.clipEnd - 0.05) return "returning";
  return current;
}

/** Estimated total broadcast-replay duration (used for the state safety net). */
export function estimateTotalMs(config: ReplayWindowConfig = DEFAULT_REPLAY_WINDOW): number {
  const normal = config.preRollSec * 1000;
  return Math.round(normal + normal / config.slowMotionRate);
}

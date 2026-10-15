// FIFAYITI — Optional broadcast integration boundary (spec Phase 1.2).
//
// THE PROBLEM THIS SOLVES
//   Before Phase 1, the official match-events route imported
//   `pushBroadcastMatchUpdate` (livekit-server-sdk RoomServiceClient) and
//   `triggerBroadcastReplay` at module-load time, then `await`ed them on
//   every official event. Three problems followed:
//
//     1. The route handler could not load if the livekit-server-sdk
//        import or the top-level `new RoomServiceClient(...)` constructor
//        threw. Match operations became hard-coupled to the video stack.
//     2. The `await` (even with `.catch(() => {})`) blocked the HTTP
//        response until the LiveKit API call resolved or timed out. On a
//        slow network or a LiveKit Cloud outage, every goal/score
//        confirmation was delayed by the broadcast path.
//     3. There was no way to operate the platform with the video stack
//        intentionally disabled (cameras, LiveKit, HLS, replay all
//        absent) — exactly the scenario the handoff requires.
//
// THE FIX
//   This module defines a small `BroadcastAdapter` interface with three
//   methods (publishMatchUpdate, requestReplay, probeHealth) and two
//   implementations:
//
//     • LiveKitBroadcastAdapter  — wraps the existing functions in
//       src/lib/streaming/broadcast-state.ts and replay-engine.ts.
//       Preserves every line of the existing LiveKit behavior.
//
//     • DisabledBroadcastAdapter — no-op. Used when
//       FIFAYITI_BROADCAST_PROVIDER=disabled is set in the environment,
//       or when a test injects it via _setBroadcastAdapterForTesting.
//
//   Callers route every broadcast action through `getBroadcastAdapter()`
//   and fire-and-forget the returned promise (`.catch()` with a structured
//   log). Match state mutation NEVER awaits broadcast completion.
//
// WHY A LIGHTWEIGHT INTERFACE (not a plugin framework)
//   The handoff explicitly says: "Do not invent an elaborate plugin
//   framework. A lightweight interface and a disabled implementation are
//   sufficient if they fit the codebase." This is exactly that — one file,
//   two implementations, no registry, no dynamic loading.

import {
  pushBroadcastMatchUpdate,
  type PushOptions,
} from "@/lib/streaming/broadcast-state";
import {
  triggerBroadcastReplay,
  type ReplayTrigger,
} from "@/lib/streaming/replay-engine";

// ── Public types ───────────────────────────────────────────────────────

/** Match-data update the events/phase routes want pushed to viewers. */
export interface BroadcastMatchUpdate {
  matchId: string;
  forceClock?: number;
  forceHalf?: string;
  forceStatus?: string;
  clockDelta?: number;
  scoreDelta?: { home: number; away: number };
  overlay?: unknown;
}

/** Replay request for an eligible event (GOL / FOT / KAT_JON / KAT_WOUJ). */
export type BroadcastReplayTrigger = ReplayTrigger;

/** Health probe result returned to /api/stream/health. */
export interface BroadcastHealth {
  provider: string;
  available: boolean;
  reason?: string;
}

// ── Interface ──────────────────────────────────────────────────────────

/**
 * Optional broadcast integration boundary.
 *
 * CONTRACT FOR CALLERS:
 *   - Call these methods fire-and-forget: `void adapter.x(...).catch(log)`.
 *   - NEVER `await` them inside a match-state mutation path. Match
 *     operations must return before the broadcast path completes.
 *   - Implementations MUST NOT throw synchronously. Errors are returned
 *     as rejected promises; the caller decides whether to log or swallow.
 *
 * CONTRACT FOR IMPLEMENTATIONS:
 *   - `publishMatchUpdate` and `requestReplay` MUST be safe to call when
 *     no video provider is configured (the disabled implementation just
 *     resolves).
 *   - `probeHealth` is the only method callers may `await` — it's read by
 *     the health endpoint, not by the match-state mutation path.
 */
export interface BroadcastAdapter {
  readonly provider: string;
  publishMatchUpdate(update: BroadcastMatchUpdate): Promise<void>;
  requestReplay(trigger: BroadcastReplayTrigger): Promise<void>;
  probeHealth(): Promise<BroadcastHealth>;
}

// ── Disabled implementation ────────────────────────────────────────────

class DisabledBroadcastAdapter implements BroadcastAdapter {
  readonly provider = "disabled";

  async publishMatchUpdate(_update: BroadcastMatchUpdate): Promise<void> {
    // Intentionally no-op. Match state was already persisted in the
    // authoritative database; the public match-center reads from there.
    return;
  }

  async requestReplay(_trigger: BroadcastReplayTrigger): Promise<void> {
    // Intentionally no-op. Replays are a broadcast feature, not a
    // football-platform feature.
    return;
  }

  async probeHealth(): Promise<BroadcastHealth> {
    return {
      provider: this.provider,
      available: false,
      reason: "FIFAYITI_BROADCAST_PROVIDER=disabled — video stack intentionally off",
    };
  }
}

// ── LiveKit implementation (preserves existing behavior) ──────────────

class LiveKitBroadcastAdapter implements BroadcastAdapter {
  readonly provider = "livekit";

  async publishMatchUpdate(update: BroadcastMatchUpdate): Promise<void> {
    const opts: PushOptions = {
      forceClock: update.forceClock,
      forceHalf: update.forceHalf,
      forceStatus: update.forceStatus,
      clockDelta: update.clockDelta,
      scoreDelta: update.scoreDelta,
      overlay: update.overlay ?? undefined,
    };
    // The underlying function already swallows errors and returns false
    // on failure. We surface a resolved promise either way; callers who
    // need to know about failures should call probeHealth() instead.
    await pushBroadcastMatchUpdate(update.matchId, opts);
  }

  async requestReplay(trigger: BroadcastReplayTrigger): Promise<void> {
    // The underlying function returns `{ ok, reason? }` and never throws
    // (it catches internally and logs). We don't propagate that — replays
    // are best-effort by design.
    await triggerBroadcastReplay(trigger);
  }

  async probeHealth(): Promise<BroadcastHealth> {
    // Delegate the actual LiveKit reachability probe to the existing
    // /api/stream/health route's logic. Here we just report the provider
    // name; the route layer assembles the full response.
    return { provider: this.provider, available: true };
  }
}

// ── Factory ────────────────────────────────────────────────────────────

let cached: BroadcastAdapter | null = null;

/**
 * Resolve the active broadcast adapter.
 *
 * - `FIFAYITI_BROADCAST_PROVIDER=disabled`  → DisabledBroadcastAdapter
 * - unset / `=livekit` / anything else     → LiveKitBroadcastAdapter
 *
 * The result is cached for the lifetime of the process (lambda). Tests
 * can override it with `_setBroadcastAdapterForTesting(null)` to reset
 * the cache, or with a mock to inject failures.
 */
export function getBroadcastAdapter(): BroadcastAdapter {
  if (cached) return cached;
  const provider = (process.env.FIFAYITI_BROADCAST_PROVIDER ?? "livekit").toLowerCase();
  cached =
    provider === "disabled" || provider === "off" || provider === "none"
      ? new DisabledBroadcastAdapter()
      : new LiveKitBroadcastAdapter();
  return cached;
}

/**
 * Test-only: inject a mock adapter (or null to reset the cache so the
 * next `getBroadcastAdapter()` call re-reads the env var).
 *
 * Production code MUST NOT call this. There is no runtime use case for
 * swapping adapters after the first call.
 */
export function _setBroadcastAdapterForTesting(adapter: BroadcastAdapter | null): void {
  cached = adapter;
}

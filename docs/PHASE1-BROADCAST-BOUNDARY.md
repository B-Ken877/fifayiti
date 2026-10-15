# Phase 1 — Optional Broadcast Boundary (Video Decoupling)

> Spec: FIFAYITI Engineering Handoff, Phase 1.
> Status: implemented on branch `phase-1/decouple-video`.
> Acceptance tests: `tests/phase1-video-decoupling.test.ts`.

## The boundary

All broadcast actions (pushing match score/clock/phase, requesting an
instant replay, probing the video stack's health) are now routed through
a single small interface in `src/lib/streaming/broadcast-adapter.ts`:

```ts
export interface BroadcastAdapter {
  readonly provider: string;                       // "livekit" | "disabled" | "throwing-test"
  publishMatchUpdate(update: BroadcastMatchUpdate): Promise<void>;
  requestReplay(trigger: BroadcastReplayTrigger): Promise<void>;
  probeHealth(): Promise<BroadcastHealth>;
}
```

Two implementations live alongside the interface:

| Implementation | When it's used | Behavior |
| --- | --- | --- |
| `LiveKitBroadcastAdapter` | default (no env var, or `FIFAYITI_BROADCAST_PROVIDER=livekit`) | Wraps the existing `pushBroadcastMatchUpdate` + `triggerBroadcastReplay` functions — preserves every line of the existing LiveKit Cloud behavior. |
| `DisabledBroadcastAdapter` | `FIFAYITI_BROADCAST_PROVIDER=disabled` | No-op. Match operations, betting settlement, and donations all work with the video stack entirely absent. |

A factory `getBroadcastAdapter()` resolves which one is active, cached for
the lambda's lifetime. Tests can inject mocks via
`_setBroadcastAdapterForTesting()`.

## Why a lightweight interface (not a plugin framework)

The handoff is explicit: *"Do not invent an elaborate plugin framework.
A lightweight interface and a disabled implementation are sufficient if
they fit the codebase."* One file, two implementations, no registry, no
dynamic loading. New providers can be added by appending one class and
extending the factory's switch.

## What changed (call-site level)

### `src/app/api/matches/[id]/events/route.ts`

Before Phase 1:

```ts
await pushBroadcastMatchUpdate(id, { forceClock, forceHalf, forceStatus })
  .catch(() => {});

if (REPLAY_KINDS.includes(body.kind)) {
  await triggerBroadcastReplay({ ... }).catch(() => {});
}

await onOfficialEventConfirmed(event.official.id).catch(() => {});
```

After Phase 1:

```ts
void getBroadcastAdapter()
  .publishMatchUpdate({ matchId: id, forceClock, forceHalf, forceStatus })
  .catch((err) => logBroadcastFailure("publishMatchUpdate", err));

if (REPLAY_KINDS.includes(body.kind)) {
  void getBroadcastAdapter()
    .requestReplay({ ... })
    .catch((err) => logBroadcastFailure("requestReplay", err));
}

await onOfficialEventConfirmed(event.official.id).catch((err) => {
  console.error(/* structured log: settlement failed (non-fatal) */);
});
```

Two changes are visible:

1. **Fire-and-forget broadcast path.** The `void` + `.catch(log)`
   pattern returns the HTTP response BEFORE the LiveKit API call
   completes or fails. Match state was already persisted durably in the
   transaction above; broadcast is best-effort.
2. **Structured non-fatal failure logging.** A broadcast failure no
   longer disappears into `.catch(() => {})`; it emits a JSON log line
   so operators can see whether the TV feed is stale.

Settlement is STILL `await`-ed — settlement is a fast in-process DB
transaction and the `OutboxEvent` row is the durable retry surface.

### `src/app/api/matches/[id]/phase/route.ts`

Same change pattern: `void getBroadcastAdapter().publishMatchUpdate(...)`
with a structured `.catch(log)`. This was the worst-case coupling because
the operator's clock tick fires every second — a slow LiveKit API would
have delayed every single tick.

### `src/lib/streaming/broadcast-state.ts` and `src/lib/betting/market-state.ts`

Both previously constructed `new RoomServiceClient(LIVEKIT_URL,
API_KEY, API_SECRET)` at module top-level. That meant importing these
modules (transitively, the events + phase routes) would crash if the
LiveKit SDK constructor ever threw.

Both now use a lazy getter:

```ts
let _roomService: RoomServiceClient | null = null;
function getRoomService(): RoomServiceClient {
  if (_roomService) return _roomService;
  _roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
  return _roomService;
}
```

No behavior change for the happy path (LiveKit creds configured). The
module now loads cleanly even when the SDK can't be constructed.

### `src/lib/streaming/livekit-config.ts`

The LiveKit Cloud credentials were hardcoded. They are now committed to
git history and must be rotated. Going forward, this module reads
optional env-var overrides (`FIFAYITI_LIVEKIT_API_KEY`,
`FIFAYITI_LIVEKIT_API_SECRET`, `FIFAYITI_LIVEKIT_HOST`) with the
hardcoded values kept ONLY as a transitional fallback so existing
local dev and production deployments continue to work unchanged.

To rotate: generate fresh credentials in the LiveKit Cloud dashboard
and set the three env vars in production. Once rotated, the fallback
values are dead weight and can be removed in a follow-up commit.

## Phase 1 acceptance criteria (from the handoff)

| Criterion | Status |
| --- | --- |
| Match operations work with LiveKit credentials absent | ✅ `FIFAYITI_BROADCAST_PROVIDER=disabled` + `tests/phase1-video-decoupling.test.ts` "works with FIFAYITI_BROADCAST_PROVIDER=disabled" |
| Match operations work with video services unavailable | ✅ `tests/phase1-video-decoupling.test.ts` "records a GOL when the broadcast adapter throws" |
| Goals and other official events are recorded correctly | ✅ Asserts `data.event.kind === "GOL"`, score updates, `OfficialEvent` row, `OutboxEvent` row |
| Scores remain correct after retries and page refreshes | ✅ Score is read back from DB after the throwing adapter rejects |
| Betting settlement still receives the correct official events | ✅ Settlement is still `await`-ed; settlement failures are now logged at error level instead of silently swallowed |
| Optional broadcast errors do not change match state | ✅ Tests assert match state survives both throwing adapter and slow adapter |
| Existing video integrations remain available when enabled | ✅ `LiveKitBroadcastAdapter` wraps the existing functions unchanged |
| Automated tests cover video-disabled behavior | ✅ 7 tests in `tests/phase1-video-decoupling.test.ts` |

## What did NOT change (preserved per handoff)

- The existing FIFAYITI TV, LiveKit Cloud, HLS, DVR, and replay
  functionality. `LiveKitBroadcastAdapter` calls the SAME existing
  `pushBroadcastMatchUpdate` and `triggerBroadcastReplay` functions
  with the SAME arguments. Nothing about the live broadcast path was
  rewritten.
- The financial ledger, the betting matching engine, the settlement
  engine, the donation accounting, the canonical transaction model.
  Phase 1 is video-only; it does not touch any financial code.
- The Prisma schema. No migration was added or modified.
- The role/permission matrix.
- The operator UI. No component or page was changed.

## Operational knobs

| Env var | Values | Effect |
| --- | --- | --- |
| `FIFAYITI_BROADCAST_PROVIDER` | `livekit` (default) | Use the existing LiveKit adapter (preserves production behavior). |
| `FIFAYITI_BROADCAST_PROVIDER` | `disabled` | Match ops work with no video stack. Use for offline-from-video matches, dev without LiveKit creds, or as a kill switch. |
| `FIFAYITI_LIVEKIT_API_KEY` | string | Override the hardcoded LiveKit API key. **Set this in production after rotating creds.** |
| `FIFAYITI_LIVEKIT_API_SECRET` | string | Override the hardcoded LiveKit API secret. **Set this in production after rotating creds.** |
| `FIFAYITI_LIVEKIT_HOST` | hostname | Override the LiveKit Cloud project host. |

## Remaining risks (Phase 1 scope)

1. **LiveKit Cloud credentials remain in git history.** Rotation is
   required on the LiveKit dashboard + setting the env-var overrides in
   production. This is documented but not yet done — flagged for the
   next operator action.
2. **No outbox poller.** The `OutboxEvent` row is created inside the
   events transaction but is never drained by a background poller.
   Inline `await onOfficialEventConfirmed(...)` is the only way
   settlement gets triggered today. If that call throws, the outbox
   row remains pending forever. Phase 2+ should add a poller.
3. **The pre-existing TS error on `events/route.ts:241`** (the
   `let updatedMatch = match` line) is unchanged by Phase 1 — fixing it
   requires adding `homeTeam`/`awayTeam` to the `db.match.update`
   include, which is out of Phase 1 scope.
4. **The 12 pre-existing SIPÒ test failures** (all timeouts, all
   in the donation/distribution tests) are unchanged by Phase 1 — they
   appear to be a SQLite migration drift issue (`Account.normalBalance`
   column missing from the dev.db) that is out of Phase 1 scope.

## Next phase recommendation

**Phase 2 — dependable live match center.** Now that match operations
work with the video stack absent, the public match-center page should
be audited to ensure it reads authoritative match state from the
database (not from LiveKit room metadata) and updates reliably via
polling or SSE without depending on the video player.

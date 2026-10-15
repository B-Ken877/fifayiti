// FIFAYITI Phase 1 acceptance tests — video-independent match operations.
//
// SPEC Phase 1 acceptance criteria:
//   - Match operations work with LiveKit credentials absent.
//   - Match operations work with video services unavailable.
//   - Goals and other official events are recorded correctly.
//   - Scores remain correct after retries and page refreshes.
//   - Betting settlement still receives the correct official events.
//   - Optional broadcast errors do not change match state.
//   - Existing video integrations remain available when enabled.
//   - Automated tests cover video-disabled behavior.
//
// These tests prove the decoupling by:
//   1. Recording a GOL with the broadcast adapter set to a stub that
//      always throws. The route MUST still return 201, persist the
//      event, update the score, fire settlement, and complete within
//      a bounded time (no `await` on the broadcast path).
//   2. Recording a GOL with FIFAYITI_BROADCAST_PROVIDER=disabled.
//      The route MUST still return 201 + persist + score + settle.
//   3. Ticking the match clock with a throwing broadcast adapter. The
//      phase route MUST still return 200 + update the clock in the DB.
//   4. Verifying that the DisabledBroadcastAdapter's no-op methods
//      resolve cleanly (so the disabled path is a real, tested path).
//
// Run: bun test tests/phase1-video-decoupling.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword, createBettorSessionCookie } from "../src/lib/betting/bettor-session";
import { createSessionCookie } from "../src/lib/auth/session";
import {
  getBroadcastAdapter,
  _setBroadcastAdapterForTesting,
  type BroadcastAdapter,
  type BroadcastHealth,
} from "../src/lib/streaming/broadcast-adapter";

// ── Test adapter that always rejects ──
class ThrowingBroadcastAdapter implements BroadcastAdapter {
  readonly provider = "throwing-test";
  // Count every call so the test can assert the route actually invoked
  // the broadcast path (and didn't accidentally short-circuit).
  calls = { publishMatchUpdate: 0, requestReplay: 0, probeHealth: 0 };

  async publishMatchUpdate(): Promise<void> {
    this.calls.publishMatchUpdate++;
    throw new Error("simulated LiveKit outage");
  }
  async requestReplay(): Promise<void> {
    this.calls.requestReplay++;
    throw new Error("simulated replay service outage");
  }
  async probeHealth(): Promise<BroadcastHealth> {
    this.calls.probeHealth++;
    return { provider: this.provider, available: false, reason: "test stub" };
  }
}

// ── Helpers ──

function buildEventsReq(body: any, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/matches/x/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildPhaseReq(body: any, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/matches/x/phase", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── Test fixture ──

describe("Phase 1 — video-independent match operations", () => {
  let matchId: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let operatorCookie: string;
  let throwingAdapter: ThrowingBroadcastAdapter;
  let savedAdapter: BroadcastAdapter | null;

  beforeAll(async () => {
    // Two distinct teams for this match fixture.
    const home = await db.team.create({
      data: { name: "P1 Home", shortName: "P1H", primaryColor: "#000", secondaryColor: "#fff", group: "A" },
    });
    const away = await db.team.create({
      data: { name: "P1 Away", shortName: "P1A", primaryColor: "#111", secondaryColor: "#fff", group: "A" },
    });
    homeTeamId = home.id;
    awayTeamId = away.id;

    const match = await db.match.create({
      data: {
        homeTeamId,
        awayTeamId,
        status: "PWOGRAM",
        half: "PRE",
        clock: 0,
      },
    });
    matchId = match.id;
    operatorCookie = createSessionCookie("live_operator");

    // Save whatever adapter was cached so we can restore it after these tests.
    savedAdapter = getBroadcastAdapter();
  });

  afterAll(async () => {
    _setBroadcastAdapterForTesting(savedAdapter);
    await db.matchEvent.deleteMany({ where: { matchId } }).catch(() => {});
    await db.officialEvent.deleteMany({ where: { matchId } }).catch(() => {});
    await db.outboxEvent.deleteMany({ where: { aggregateId: matchId } }).catch(() => {});
    await db.bettingAuditLog.deleteMany({ where: { targetType: "match_event" } }).catch(() => {});
    await db.match.deleteMany({ where: { id: matchId } }).catch(() => {});
    await db.team.deleteMany({ where: { id: { in: [homeTeamId, awayTeamId] } } }).catch(() => {});
    await db.$disconnect();
  });

  beforeEach(() => {
    throwingAdapter = new ThrowingBroadcastAdapter();
    _setBroadcastAdapterForTesting(throwingAdapter);
  });

  afterEach(() => {
    _setBroadcastAdapterForTesting(null);
  });

  it("records a GOL when the broadcast adapter throws (publishMatchUpdate + requestReplay both reject)", async () => {
    const req = buildEventsReq(
      { kind: "GOL", teamId: homeTeamId, description: "decoupled goal" },
      operatorCookie,
    );
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);

    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.event.kind).toBe("GOL");
    expect(data.event.teamId).toBe(homeTeamId);

    // The match score should reflect the goal — broadcast failures
    // must not roll back the score.
    const match = await db.match.findUnique({ where: { id: matchId } });
    expect(match?.homeScore).toBe(1);
    expect(match?.awayScore).toBe(0);

    // An OfficialEvent must exist (drives settlement).
    const official = await db.officialEvent.findFirst({
      where: { matchId, matchEventId: data.event.id },
    });
    expect(official).not.toBeNull();
    expect(official?.status).toBe("CONFIRMED");
    expect(official?.eventType).toBe("GOL");

    // An OutboxEvent must exist (durable retry surface).
    const outbox = await db.outboxEvent.findMany({
      where: { aggregateId: matchId, eventType: "OfficialEventConfirmed" },
    });
    expect(outbox.length).toBeGreaterThanOrEqual(1);

    // The broadcast adapter MUST have been invoked (route didn't
    // short-circuit the broadcast path — it just made it non-fatal).
    // Give the fire-and-forget promise a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(throwingAdapter.calls.publishMatchUpdate).toBeGreaterThanOrEqual(1);
    expect(throwingAdapter.calls.requestReplay).toBeGreaterThanOrEqual(1);
  });

  it("returns 201 within a bounded time even when the broadcast path is slow", async () => {
    // Inject an adapter that takes 2s to reject — the route must NOT
    // wait for it. The pre-Phase-1 `await` would have made this test
    // take ≥2s. Fire-and-forget returns in well under 1s.
    const slowAdapter: BroadcastAdapter = {
      provider: "slow-test",
      async publishMatchUpdate() {
        await new Promise((r) => setTimeout(r, 2000));
        throw new Error("slow simulated timeout");
      },
      async requestReplay() {
        await new Promise((r) => setTimeout(r, 2000));
        throw new Error("slow simulated timeout");
      },
      async probeHealth() {
        return { provider: "slow-test", available: false };
      },
    };
    _setBroadcastAdapterForTesting(slowAdapter);

    const req = buildEventsReq(
      { kind: "FOT", teamId: awayTeamId, description: "foul under slow broadcast" },
      operatorCookie,
    );
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");

    const start = Date.now();
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(201);
    // Generous bound — settlement + DB writes should be well under 1s.
    // If this fails, the route is `await`ing the broadcast path again.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("works with FIFAYITI_BROADCAST_PROVIDER=disabled (DisabledBroadcastAdapter)", async () => {
    _setBroadcastAdapterForTesting(null);
    process.env.FIFAYITI_BROADCAST_PROVIDER = "disabled";
    try {
      // Sanity: the factory returns the disabled adapter.
      const adapter = getBroadcastAdapter();
      expect(adapter.provider).toBe("disabled");

      const req = buildEventsReq(
        { kind: "KAT_JON", teamId: awayTeamId, description: "card with video off" },
        operatorCookie,
      );
      const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
      const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);

      expect(res.status).toBe(201);

      const match = await db.match.findUnique({ where: { id: matchId } });
      // No score change for a card.
      expect(match?.homeScore).toBe(1);
      expect(match?.awayScore).toBe(0);

      // Disabled adapter's no-op methods should resolve cleanly.
      await expect(adapter.publishMatchUpdate({ matchId })).resolves.toBeUndefined();
      await expect(adapter.requestReplay({ kind: "GOL" })).resolves.toBeUndefined();
      const health = await adapter.probeHealth();
      expect(health.available).toBe(false);
      expect(health.provider).toBe("disabled");
    } finally {
      delete process.env.FIFAYITI_BROADCAST_PROVIDER;
      _setBroadcastAdapterForTesting(null);
    }
  });

  it("phase route (clock tick) updates the DB and does not await broadcast", async () => {
    // Set match to first half so a tick is valid.
    await db.match.update({ where: { id: matchId }, data: { status: "AN_DIRÈK", half: "1", clock: 0 } });

    _setBroadcastAdapterForTesting(new ThrowingBroadcastAdapter());

    const req = buildPhaseReq({ action: "tick" }, operatorCookie);
    const { POST } = await import("../src/app/api/matches/[id]/phase/route.ts");

    const start = Date.now();
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsedMs).toBeLessThan(1000);

    const match = await db.match.findUnique({ where: { id: matchId } });
    expect(match?.clock).toBe(1);
  });

  it("phase route (start match) works with the disabled adapter", async () => {
    _setBroadcastAdapterForTesting(null);
    process.env.FIFAYITI_BROADCAST_PROVIDER = "disabled";
    try {
      // Reset match to PRE state.
      await db.match.update({ where: { id: matchId }, data: { status: "PWOGRAM", half: "PRE", clock: 0 } });

      const req = buildPhaseReq({ action: "start" }, operatorCookie);
      const { POST } = await import("../src/app/api/matches/[id]/phase/route.ts");
      const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match.status).toBe("AN_DIRÈK");
      expect(data.match.half).toBe("1");
      expect(data.match.clock).toBe(0);
    } finally {
      delete process.env.FIFAYITI_BROADCAST_PROVIDER;
      _setBroadcastAdapterForTesting(null);
    }
  });

  it("unauthenticated request still returns 401 (security boundary intact after refactor)", async () => {
    const req = buildEventsReq({ kind: "GOL", teamId: homeTeamId }, null);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(401);
  });

  it("non-LIVE_OPERATOR role still returns 403 (authorization intact)", async () => {
    const cookie = createSessionCookie("president");
    const req = buildEventsReq({ kind: "GOL", teamId: homeTeamId }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(403);
  });
});

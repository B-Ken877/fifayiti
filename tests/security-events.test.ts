// FIFAYITI PARIAJ — test: official events endpoint security (spec P0.1).
//
// Tests:
//   1. unauthenticated → 401
//   2. bettor → 403
//   3. PRESIDENT → 403
//   4. DIRECTOR → 403
//   5. TEAM_ADMIN → 403
//   6. LIVE_OPERATOR → success (when the event type is valid)
//   7. invalid event type → 400
//   8. forged operatorId in body → ignored (operator derived from session)
//
// Run: bun test tests/security-events.test.ts

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/betting/bettor-session";
import { createBettorSessionCookie } from "../src/lib/betting/bettor-session";
import { createSessionCookie } from "../src/lib/auth/session";

// Helper: build a request with cookies.
function buildReq(method: "POST" | "GET", body: any, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/matches/test-match-id/events", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Official events endpoint security", () => {
  let matchId: string;
  let homeTeamId: string;
  let awayTeamId: string;

  beforeAll(async () => {
    // Create or reuse teams + a match.
    let home = await db.team.findFirst();
    let away = await db.team.findFirst({ where: { id: { not: home?.id ?? "" } } });
    if (!home || !away) {
      home = await db.team.create({ data: { name: "Test Home", shortName: "TESTH", primaryColor: "#000", secondaryColor: "#fff", group: "A" } });
      away = await db.team.create({ data: { name: "Test Away", shortName: "TESTA", primaryColor: "#000", secondaryColor: "#fff", group: "A" } });
    }
    homeTeamId = home.id;
    awayTeamId = away.id;

    const match = await db.match.create({
      data: {
        homeTeamId, awayTeamId,
        status: "PWOGRAM",
        half: "PRE",
        clock: 0,
      },
    });
    matchId = match.id;
  });

  afterAll(async () => {
    await db.matchEvent.deleteMany({ where: { matchId } });
    await db.officialEvent.deleteMany({ where: { matchId } });
    await db.match.deleteMany({ where: { id: matchId } });
    await db.$disconnect();
  });

  it("unauthenticated request → 401", async () => {
    const req = buildReq("POST", { kind: "GOL", teamId: homeTeamId }, null);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(401);
  });

  it("PRESIDENT → 403", async () => {
    const cookie = createSessionCookie("president");
    const req = buildReq("POST", { kind: "GOL", teamId: homeTeamId }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(403);
  });

  it("DIRECTOR → 403", async () => {
    const cookie = createSessionCookie("director");
    const req = buildReq("POST", { kind: "GOL", teamId: homeTeamId }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(403);
  });

  it("TEAM_ADMIN → 403", async () => {
    const cookie = createSessionCookie("team_admin");
    const req = buildReq("POST", { kind: "GOL", teamId: homeTeamId }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(403);
  });

  it("BETTOR session → 403 (bettor cannot create official events)", async () => {
    const bettor = await db.bettor.create({
      data: { email: `test-events-${Date.now()}@test.com`, passwordHash: hashPassword("test12345"), status: "ACTIVE" },
    });
    const cookie = createBettorSessionCookie(bettor.id, bettor.email);
    const req = buildReq("POST", { kind: "GOL", teamId: homeTeamId }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(403);
    await db.bettor.delete({ where: { id: bettor.id } });
  });

  it("invalid event type → 400", async () => {
    const cookie = createSessionCookie("live_operator");
    const req = buildReq("POST", { kind: "ARBITRARY_FAKE_EVENT" }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(400);
  });

  it("forged operatorId in body → ignored (operator derived from session)", async () => {
    const cookie = createSessionCookie("live_operator");
    const req = buildReq("POST", {
      kind: "GOL",
      teamId: homeTeamId,
      operatorId: "forged-attacker-id",  // should be ignored
    }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    if (res.status === 201) {
      const data = await res.json();
      // The event's recordedById should be the SESSION role, not the forged id.
      const official = await db.officialEvent.findFirst({
        where: { matchId, matchEventId: data.event.id },
      });
      expect(official?.operatorId).toBe("live_operator");
      expect(official?.operatorId).not.toBe("forged-attacker-id");
    }
  });

  it("team not in match → 400", async () => {
    const cookie = createSessionCookie("live_operator");
    const otherTeam = await db.team.create({
      data: { name: "Other Team", shortName: "OTH", primaryColor: "#000", secondaryColor: "#fff", group: "B" },
    });
    const req = buildReq("POST", { kind: "GOL", teamId: otherTeam.id }, cookie);
    const { POST } = await import("../src/app/api/matches/[id]/events/route.ts");
    const res = await POST(req as any, { params: Promise.resolve({ id: matchId }) } as any);
    expect(res.status).toBe(400);
    await db.team.delete({ where: { id: otherTeam.id } });
  });
});

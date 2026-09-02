// FIFAYITI PARIAJ — test: one-active-market enforcement (spec P0.5).
//
// Tests:
//   1. concurrent market creation → only one succeeds (race protection)
//   2. creating a second market while one is OPEN → rejected

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { createMarketAtomic, hasActiveMarket } from "../src/lib/betting/market-state";

describe("One-active-market enforcement (atomic)", () => {
  let matchId: string;
  let templateId: string;

  beforeAll(async () => {
    const home = await db.team.findFirst();
    const away = await db.team.findFirst({ where: { id: { not: home?.id ?? "" } } });
    if (!home || !away) throw new Error("Need 2 teams");

    const match = await db.match.create({
      data: { homeTeamId: home.id, awayTeamId: away.id, status: "AN_DIRÈK", half: "1", clock: 0 },
    });
    matchId = match.id;

    const tpl = await db.marketTemplate.findUnique({ where: { code: "NEXT_GOAL" } });
    if (!tpl) throw new Error("NEXT_GOAL not seeded");
    templateId = tpl.id;
  });

  afterAll(async () => {
    await db.bettingMarket.deleteMany({ where: { matchId } });
    await db.match.deleteMany({ where: { id: matchId } });
    await db.$disconnect();
  });

  it("concurrent market creation → only one succeeds", async () => {
    const selections = [
      { key: "HOME", label: "H", order: 0 },
      { key: "AWAY", label: "A", order: 1 },
    ];

    // Fire two concurrent createMarketAtomic calls.
    const [r1, r2] = await Promise.all([
      createMarketAtomic({ matchId, templateId, question: "Q1", config: "{}", selections }),
      createMarketAtomic({ matchId, templateId, question: "Q2", config: "{}", selections }),
    ]);

    const successes = [r1, r2].filter((r) => r.ok).length;
    const failures = [r1, r2].filter((r) => !r.ok).length;

    // Exactly one should succeed; the other should fail.
    expect(successes).toBe(1);
    expect(failures).toBe(1);
    expect(failures === 1 ? (r1.ok ? r2.reason : r1.reason) : "").toContain("active market");
  });

  it("hasActiveMarket returns true after one is created", async () => {
    const active = await hasActiveMarket(matchId);
    expect(active).toBe(true);
  });
});

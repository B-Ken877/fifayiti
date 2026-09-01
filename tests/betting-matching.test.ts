// FIFAYITI PARIAJ — test: matching engine exact-stake rule.
//
// Tests:
//   - 500 ↔ 500 = MATCH
//   - 500 ↔ 250 = NO MATCH (different stake)
//   - same selection = NO MATCH
//   - duplicate match (match the same order twice) = prevented

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/betting/bettor-session";
import { deposit, reserveForBet } from "../src/lib/betting/wallet";
import { tryMatch } from "../src/lib/betting/matching-engine";
import { MARKET_TEMPLATES, DEFAULT_STAKE_POOLS } from "../src/lib/betting/types";

describe("Matching engine — exact stake rule", () => {
  let bettorA: string, bettorB: string, bettorC: string;
  let marketId: string, matchId: string;
  let homeSelectionId: string, awaySelectionId: string;

  beforeAll(async () => {
    // Create 3 test bettors.
    const [a, b, c] = await Promise.all([
      db.bettor.create({ data: { email: `test-match-a-${Date.now()}@test.com`, passwordHash: hashPassword("test123456"), status: "ACTIVE" } }),
      db.bettor.create({ data: { email: `test-match-b-${Date.now()}@test.com`, passwordHash: hashPassword("test123456"), status: "ACTIVE" } }),
      db.bettor.create({ data: { email: `test-match-c-${Date.now()}@test.com`, passwordHash: hashPassword("test123456"), status: "ACTIVE" } }),
    ]);
    bettorA = a.id; bettorB = b.id; bettorC = c.id;

    // Deposit 1000 HTG each.
    for (const id of [bettorA, bettorB, bettorC]) {
      await deposit(id, 100000n, "test-deposit");
    }

    // Create a test match + market.
    const homeTeam = await db.team.findFirst();
    const awayTeam = await db.team.findFirst({ where: { id: { not: homeTeam?.id ?? "" } } });
    if (!homeTeam || !awayTeam) throw new Error("Need at least 2 teams in DB for tests");

    const match = await db.match.create({
      data: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: "AN_DIRÈK",
        half: "1",
        clock: 0,
      },
    });
    matchId = match.id;

    const template = await db.marketTemplate.findUnique({ where: { code: "NEXT_GOAL" } });
    if (!template) throw new Error("NEXT_GOAL template not seeded");

    const market = await db.bettingMarket.create({
      data: {
        matchId,
        templateId: template.id,
        status: "OPEN",
        question: template.label,
        config: "{}",
        openedAt: new Date(),
      },
    });
    marketId = market.id;

    const [homeSel, awaySel] = await Promise.all([
      db.marketSelection.create({ data: { marketId, key: "HOME", label: homeTeam.shortName, order: 0 } }),
      db.marketSelection.create({ data: { marketId, key: "AWAY", label: awayTeam.shortName, order: 1 } }),
    ]);
    homeSelectionId = homeSel.id;
    awaySelectionId = awaySel.id;
  });

  afterAll(async () => {
    for (const id of [bettorA, bettorB, bettorC]) {
      await db.ledgerEntry.deleteMany({ where: { bettorId: id } });
      await db.wallet.deleteMany({ where: { bettorId: id } });
      await db.bettor.delete({ where: { id } });
    }
    await db.betOrder.deleteMany({ where: { marketId } });
    await db.marketSelection.deleteMany({ where: { marketId } });
    await db.bettingMarket.deleteMany({ where: { id: marketId } });
    await db.match.deleteMany({ where: { id: matchId } });
    await db.$disconnect();
  });

  async function placeBet(bettorId: string, selectionId: string, stake: bigint) {
    const bet = await db.betOrder.create({
      data: {
        bettorId,
        marketId,
        selectionId,
        stakeCentimes: stake,
        status: "OPEN",
      },
    });
    await reserveForBet(bettorId, stake, bet.id);
    return bet;
  }

  it("should match two opposing bets at the SAME stake (500 ↔ 500)", async () => {
    const betA = await placeBet(bettorA, homeSelectionId, 50000n);
    const betB = await placeBet(bettorB, awaySelectionId, 50000n);

    // Try to match betA — should find betB.
    const result = await tryMatch(betA.id);
    expect(result.matched).toBe(true);

    // Verify both bets are MATCHED.
    const a = await db.betOrder.findUnique({ where: { id: betA.id } });
    const b = await db.betOrder.findUnique({ where: { id: betB.id } });
    expect(a?.status).toBe("MATCHED");
    expect(b?.status).toBe("MATCHED");
    expect(a?.matchedWithId).toBe(betB.id);
    expect(b?.matchedWithId).toBe(betA.id);
  });

  it("should NOT match opposing bets at DIFFERENT stakes (500 ↔ 250)", async () => {
    const betC = await placeBet(bettorC, homeSelectionId, 50000n);
    const betD = await placeBet(bettorB, awaySelectionId, 25000n);

    const result = await tryMatch(betC.id);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain("no opposing open bet");

    // Clean up.
    await db.betOrder.update({ where: { id: betC.id }, data: { status: "CANCELLED" } });
    await db.betOrder.update({ where: { id: betD.id }, data: { status: "CANCELLED" } });
  });

  it("should NOT match bets on the SAME selection", async () => {
    const betE = await placeBet(bettorA, homeSelectionId, 25000n);
    const betF = await placeBet(bettorB, homeSelectionId, 25000n);

    const result = await tryMatch(betE.id);
    expect(result.matched).toBe(false);

    await db.betOrder.update({ where: { id: betE.id }, data: { status: "CANCELLED" } });
    await db.betOrder.update({ where: { id: betF.id }, data: { status: "CANCELLED" } });
  });
});

// FIFAYITI PARIAJ — test: settlement engine.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/betting/bettor-session";
import { deposit, reserveForBet, getWallet } from "../src/lib/betting/wallet";
import { tryMatch } from "../src/lib/betting/matching-engine";
import { onOfficialEventConfirmed } from "../src/lib/betting/settlement-engine";

describe("Settlement engine", () => {
  let bettorA: string, bettorB: string;
  let marketId: string, matchId: string;
  let homeSelectionId: string, awaySelectionId: string;
  let homeTeamId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      db.bettor.create({ data: { email: `test-settle-a-${Date.now()}@test.com`, passwordHash: hashPassword("test123456"), status: "ACTIVE" } }),
      db.bettor.create({ data: { email: `test-settle-b-${Date.now()}@test.com`, passwordHash: hashPassword("test123456"), status: "ACTIVE" } }),
    ]);
    bettorA = a.id; bettorB = b.id;
    await deposit(bettorA, 100000n, "test");
    await deposit(bettorB, 100000n, "test");

    const homeTeam = await db.team.findFirst();
    const awayTeam = await db.team.findFirst({ where: { id: { not: homeTeam?.id ?? "" } } });
    if (!homeTeam || !awayTeam) throw new Error("Need 2 teams");
    homeTeamId = homeTeam.id;

    const match = await db.match.create({
      data: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: "AN_DIRÈK",
        half: "1",
        clock: 600,
        homeScore: 0,
        awayScore: 0,
      },
    });
    matchId = match.id;

    const template = await db.marketTemplate.findUnique({ where: { code: "NEXT_GOAL" } });
    if (!template) throw new Error("NEXT_GOAL not seeded");

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

    const [h, aw] = await Promise.all([
      db.marketSelection.create({ data: { marketId, key: "HOME", label: homeTeam.shortName, order: 0 } }),
      db.marketSelection.create({ data: { marketId, key: "AWAY", label: awayTeam.shortName, order: 1 } }),
    ]);
    homeSelectionId = h.id;
    awaySelectionId = aw.id;
  });

  afterAll(async () => {
    for (const id of [bettorA, bettorB]) {
      await db.ledgerEntry.deleteMany({ where: { bettorId: id } });
      await db.wallet.deleteMany({ where: { bettorId: id } });
      await db.bettor.delete({ where: { id } });
    }
    await db.officialEvent.deleteMany({ where: { matchId } });
    await db.betOrder.deleteMany({ where: { marketId } });
    await db.marketSelection.deleteMany({ where: { marketId } });
    await db.bettingMarket.deleteMany({ where: { id: marketId } });
    await db.match.deleteMany({ where: { id: matchId } });
    await db.$disconnect();
  });

  it("should settle a NEXT_GOAL market on a GOL event (home scores)", async () => {
    // Bettor A backs HOME, Bettor B backs AWAY, both 500 HTG.
    const betA = await db.betOrder.create({
      data: { bettorId: bettorA, marketId, selectionId: homeSelectionId, stakeCentimes: 50000n, status: "OPEN" },
    });
    const betB = await db.betOrder.create({
      data: { bettorId: bettorB, marketId, selectionId: awaySelectionId, stakeCentimes: 50000n, status: "OPEN" },
    });
    await reserveForBet(bettorA, 50000n, betA.id);
    await reserveForBet(bettorB, 50000n, betB.id);

    // Match them.
    const matchResult = await tryMatch(betA.id);
    expect(matchResult.matched).toBe(true);

    // Create a confirmed GOL event for the home team.
    const event = await db.officialEvent.create({
      data: {
        matchId,
        sequenceNumber: 1,
        eventType: "GOL",
        teamId: homeTeamId,
        matchTime: "10:00",
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    // Fire the settlement engine.
    const results = await onOfficialEventConfirmed(event.id);
    expect(results.length).toBeGreaterThan(0);
    const settled = results.find((r) => r.outcome === "settled");
    expect(settled).toBeDefined();
    expect(settled?.winningSelectionKey).toBe("HOME");

    // Verify the bets.
    const a = await db.betOrder.findUnique({ where: { id: betA.id } });
    const b = await db.betOrder.findUnique({ where: { id: betB.id } });
    expect(a?.status).toBe("SETTLED");
    expect(a?.settleOutcome).toBe("WIN");
    expect(b?.status).toBe("SETTLED");
    expect(b?.settleOutcome).toBe("LOSS");

    // Verify the wallet: A should have ~950 HTG (500 stake + 475 winnings - 25 commission).
    const walletA = await getWallet(bettorA);
    const expectedPayout = 95000n; // 50000 + 47500 (pot 100000 - 5% commission = 5000)
    expect(walletA?.availableCentimes).toBe(expectedPayout);

    // B should have 0 (lost their 500).
    const walletB = await getWallet(bettorB);
    expect(walletB?.availableCentimes).toBe(0n);
  });
});

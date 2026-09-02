// FIFAYITI PARIAJ — test: settlement idempotency (spec P0.6).
//
// Tests:
//   1. settle a market once → bettor's wallet credited once
//   2. settle the same market again (retry) → no second credit (idempotent)
//   3. concurrent settlement attempts → only one succeeds

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/betting/bettor-session";
import { deposit, reserveForBet, getWallet } from "../src/lib/betting/wallet";
import { tryMatch } from "../src/lib/betting/matching-engine";
import { onOfficialEventConfirmed } from "../src/lib/betting/settlement-engine";

describe("Settlement idempotency", () => {
  let bettorA: string, bettorB: string;
  let marketId: string, matchId: string;
  let homeSelectionId: string, awaySelectionId: string;
  let homeTeamId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      db.bettor.create({ data: { email: `test-idem-a-${Date.now()}@test.com`, passwordHash: hashPassword("test12345"), status: "ACTIVE" } }),
      db.bettor.create({ data: { email: `test-idem-b-${Date.now()}@test.com`, passwordHash: hashPassword("test12345"), status: "ACTIVE" } }),
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
        homeTeamId: homeTeam.id, awayTeamId: awayTeam.id,
        status: "AN_DIRÈK", half: "1", clock: 600, homeScore: 0, awayScore: 0,
      },
    });
    matchId = match.id;

    const template = await db.marketTemplate.findUnique({ where: { code: "NEXT_GOAL" } });
    if (!template) throw new Error("NEXT_GOAL not seeded");

    const market = await db.bettingMarket.create({
      data: { matchId, templateId: template.id, status: "OPEN", question: template.label, config: "{}", openedAt: new Date() },
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
    await db.settlementTransaction.deleteMany({ where: { marketId } });
    await db.betOrder.deleteMany({ where: { marketId } });
    await db.marketSelection.deleteMany({ where: { marketId } });
    await db.bettingMarket.deleteMany({ where: { id: marketId } });
    await db.match.deleteMany({ where: { id: matchId } });
    await db.$disconnect();
  });

  it("should settle once + reject duplicate settlement (idempotent)", async () => {
    // Both bettors place opposing 500 HTG bets.
    const betA = await db.betOrder.create({
      data: { bettorId: bettorA, marketId, selectionId: homeSelectionId, stakeCentimes: 50000n, status: "OPEN" },
    });
    const betB = await db.betOrder.create({
      data: { bettorId: bettorB, marketId, selectionId: awaySelectionId, stakeCentimes: 50000n, status: "OPEN" },
    });
    await reserveForBet(bettorA, 50000n, betA.id);
    await reserveForBet(bettorB, 50000n, betB.id);
    await tryMatch(betA.id);

    // Create a GOL event for the home team.
    const event = await db.officialEvent.create({
      data: {
        matchId, sequenceNumber: 1, eventType: "GOL", teamId: homeTeamId,
        matchTime: "10:00", status: "CONFIRMED", confirmedAt: new Date(),
      },
    });

    // First settlement — should succeed.
    const results1 = await onOfficialEventConfirmed(event.id);
    const settled1 = results1.find((r) => r.outcome === "settled");
    expect(settled1).toBeDefined();

    const walletA1 = await getWallet(bettorA);
    const balanceA1 = walletA1?.availableCentimes ?? 0n;

    // Second settlement (retry) — should return no_action (idempotent).
    const results2 = await onOfficialEventConfirmed(event.id);
    const noAction = results2.find((r) => r.outcome === "no_action");
    expect(noAction).toBeDefined();

    // The bettor's balance should NOT have changed.
    const walletA2 = await getWallet(bettorA);
    const balanceA2 = walletA2?.availableCentimes ?? 0n;
    expect(balanceA2).toBe(balanceA1);
  });

  it("should reject concurrent settlement attempts (only one wins)", async () => {
    // Create a new market for this test (the previous one is already settled).
    const template = await db.marketTemplate.findUnique({ where: { code: "NEXT_GOAL" } });
    if (!template) throw new Error("NEXT_GOAL not seeded");
    const match2 = await db.match.create({
      data: { homeTeamId, awayTeamId: (await db.team.findFirst({ where: { id: { not: homeTeamId } } }))!.id, status: "AN_DIRÈK", half: "1", clock: 700 },
    });
    const market2 = await db.bettingMarket.create({
      data: { matchId: match2.id, templateId: template.id, status: "OPEN", question: template.label, config: "{}", openedAt: new Date() },
    });
    const selA = await db.marketSelection.create({ data: { marketId: market2.id, key: "HOME", label: "H", order: 0 } });
    const selB = await db.marketSelection.create({ data: { marketId: market2.id, key: "AWAY", label: "A", order: 1 } });
    const betA = await db.betOrder.create({ data: { bettorId: bettorA, marketId: market2.id, selectionId: selA.id, stakeCentimes: 25000n, status: "OPEN" } });
    const betB = await db.betOrder.create({ data: { bettorId: bettorB, marketId: market2.id, selectionId: selB.id, stakeCentimes: 25000n, status: "OPEN" } });
    await reserveForBet(bettorA, 25000n, betA.id);
    await reserveForBet(bettorB, 25000n, betB.id);
    await tryMatch(betA.id);

    const event = await db.officialEvent.create({
      data: { matchId: match2.id, sequenceNumber: 1, eventType: "GOL", teamId: homeTeamId, status: "CONFIRMED", confirmedAt: new Date() },
    });

    // Fire two concurrent settlement attempts.
    const [r1, r2] = await Promise.all([
      onOfficialEventConfirmed(event.id),
      onOfficialEventConfirmed(event.id),
    ]);

    const settledCount = [r1, r2].flat().filter((r) => r.outcome === "settled").length;
    const noActionCount = [r1, r2].flat().filter((r) => r.outcome === "no_action").length;

    // Exactly ONE should settle; the other should be no_action.
    expect(settledCount).toBe(1);
    expect(noActionCount).toBeGreaterThanOrEqual(1);

    // Cleanup.
    await db.betOrder.deleteMany({ where: { marketId: market2.id } });
    await db.marketSelection.deleteMany({ where: { marketId: market2.id } });
    await db.bettingMarket.deleteMany({ where: { id: market2.id } });
    await db.officialEvent.deleteMany({ where: { matchId: match2.id } });
    await db.match.deleteMany({ where: { id: match2.id } });
  });
});

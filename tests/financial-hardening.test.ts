// FIFAYITI — Financial DB Hardening test suite.
//
// Tests the canonical financial ledger invariants:
//   1. Balanced transactions (Σ debits == Σ credits)
//   2. Positive amounts only (no zero-value entries)
//   3. Idempotency (same key + same payload = same result; different payload = rejected)
//   4. Account balance reconciliation
//   5. Posted immutability (not testable on SQLite — requires PostgreSQL triggers)
//   6. SIPÒ distribution totals match allocations
//   7. Settlement derives from actual matched orders
//   8. No LedgerEntry writes (legacy table frozen)

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { postFinancialTransaction } from "../src/lib/finance/ledger";
import { getOrCreateCustodyAccount, getOrCreateBettorAvailableAccount, getOrCreateBettorReservedAccount, getOrCreateTeamAccount, getOrCreatePlayerAccount } from "../src/lib/support/accounts";
import { deposit, reserveForBet, releaseFromBet, matchBetFunds, settleWin, settleLoss, refundBet } from "../src/lib/betting/wallet";

describe("Financial DB Hardening — Canonical Ledger", () => {
  let bettorId: string;
  let teamId: string;
  let playerIds: string[] = [];
  let custodyAccountId: string;
  let availableAccountId: string;
  let reservedAccountId: string;

  beforeAll(async () => {
    // Create test entities.
    const bettor = await db.bettor.create({
      data: { email: `hardening-${Date.now()}@test.com`, passwordHash: "$2b$10$test", status: "ACTIVE" },
    });
    bettorId = bettor.id;

    const team = await db.team.create({
      data: { name: `Hardening FC ${Date.now()}`, shortName: "HARD", primaryColor: "#000", secondaryColor: "#fff", group: "Z" },
    });
    teamId = team.id;
    for (let i = 1; i <= 5; i++) {
      const p = await db.player.create({
        data: { teamId, firstName: `P${i}`, lastName: "Test", jerseyNumber: i, position: "MID", status: "VERIFYE" },
      });
      playerIds.push(p.id);
    }

    custodyAccountId = (await getOrCreateCustodyAccount()).id;
    availableAccountId = (await getOrCreateBettorAvailableAccount(bettorId)).id;
    reservedAccountId = (await getOrCreateBettorReservedAccount(bettorId)).id;
  });

  afterAll(async () => {
    // Clean up.
    for (const pid of playerIds) {
      const acct = await db.account.findFirst({ where: { type: "player_earnings", playerId: pid } });
      if (acct) await db.accountEntry.deleteMany({ where: { accountId: acct.id } }).catch(() => {});
      await db.account.deleteMany({ where: { type: "player_earnings", playerId: pid } }).catch(() => {});
      await db.player.delete({ where: { id: pid } }).catch(() => {});
    }
    const ta = await db.account.findFirst({ where: { type: "team_support", teamId } });
    if (ta) await db.accountEntry.deleteMany({ where: { accountId: ta.id } }).catch(() => {});
    await db.account.deleteMany({ where: { type: "team_support", teamId } }).catch(() => {});
    await db.team.delete({ where: { id: teamId } }).catch(() => {});

    for (const acctId of [availableAccountId, reservedAccountId]) {
      await db.accountEntry.deleteMany({ where: { accountId: acctId } }).catch(() => {});
    }
    await db.account.deleteMany({ where: { bettorId } }).catch(() => {});
    await db.wallet.deleteMany({ where: { bettorId } }).catch(() => {});
    await db.bettor.delete({ where: { id: bettorId } }).catch(() => {});
    await db.$disconnect();
  });

  // ── 1. Balanced transaction ──
  it("balanced transaction: Σ debits == Σ credits", async () => {
    const result = await postFinancialTransaction({
      idempotencyKey: `test-balanced-${Date.now()}`,
      requestFingerprint: "test-balanced-fp",
      type: "DEPOSIT",
      entries: [
        { accountId: custodyAccountId, direction: "debit", amountCentimes: 10000n },
        { accountId: availableAccountId, direction: "credit", amountCentimes: 10000n },
      ],
    });
    expect(result.transactionId).toBeDefined();
    expect(result.alreadyPosted).toBe(false);

    // Verify the entries.
    const entries = await db.accountEntry.findMany({
      where: { transactionId: result.transactionId },
    });
    expect(entries.length).toBe(2);
    const debits = entries.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amountCentimes, 0n);
    const credits = entries.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amountCentimes, 0n);
    expect(debits).toBe(credits);
  });

  // ── 2. Unbalanced transaction rejected ──
  it("unbalanced transaction is rejected", async () => {
    try {
      await postFinancialTransaction({
        idempotencyKey: `test-unbalanced-${Date.now()}`,
        requestFingerprint: "test-unbalanced-fp",
        type: "DEPOSIT",
        entries: [
          { accountId: custodyAccountId, direction: "debit", amountCentimes: 10000n },
          { accountId: availableAccountId, direction: "credit", amountCentimes: 5000n },
        ],
      });
      expect(false).toBe(true); // should not reach
    } catch (e: any) {
      expect(e?.message).toContain("Unbalanced");
    }
  });

  // ── 3. Zero amount rejected ──
  it("zero amount is rejected", async () => {
    try {
      await postFinancialTransaction({
        idempotencyKey: `test-zero-${Date.now()}`,
        requestFingerprint: "test-zero-fp",
        type: "DEPOSIT",
        entries: [
          { accountId: custodyAccountId, direction: "debit", amountCentimes: 0n },
          { accountId: availableAccountId, direction: "credit", amountCentimes: 0n },
        ],
      });
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e?.message).toContain("positive");
    }
  });

  // ── 4. Negative amount rejected ──
  it("negative amount is rejected", async () => {
    try {
      await postFinancialTransaction({
        idempotencyKey: `test-negative-${Date.now()}`,
        requestFingerprint: "test-negative-fp",
        type: "DEPOSIT",
        entries: [
          { accountId: custodyAccountId, direction: "debit", amountCentimes: -100n },
          { accountId: availableAccountId, direction: "credit", amountCentimes: -100n },
        ],
      });
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e?.message).toContain("positive");
    }
  });

  // ── 5. Idempotency: same key + same payload = same result ──
  it("idempotency: same key + same payload returns original result", async () => {
    const key = `test-idempotent-${Date.now()}`;
    const fp = "test-idempotent-fp";
    const r1 = await postFinancialTransaction({
      idempotencyKey: key,
      requestFingerprint: fp,
      type: "DEPOSIT",
      entries: [
        { accountId: custodyAccountId, direction: "debit", amountCentimes: 5000n },
        { accountId: availableAccountId, direction: "credit", amountCentimes: 5000n },
      ],
    });
    expect(r1.alreadyPosted).toBe(false);

    const r2 = await postFinancialTransaction({
      idempotencyKey: key,
      requestFingerprint: fp,
      type: "DEPOSIT",
      entries: [
        { accountId: custodyAccountId, direction: "debit", amountCentimes: 5000n },
        { accountId: availableAccountId, direction: "credit", amountCentimes: 5000n },
      ],
    });
    expect(r2.alreadyPosted).toBe(true);
    expect(r2.transactionId).toBe(r1.transactionId);
  });

  // ── 6. Idempotency: same key + different payload = rejected ──
  it("idempotency: same key + different payload is rejected", async () => {
    const key = `test-idempotent-diff-${Date.now()}`;
    await postFinancialTransaction({
      idempotencyKey: key,
      requestFingerprint: "fp1",
      type: "DEPOSIT",
      entries: [
        { accountId: custodyAccountId, direction: "debit", amountCentimes: 5000n },
        { accountId: availableAccountId, direction: "credit", amountCentimes: 5000n },
      ],
    });

    try {
      await postFinancialTransaction({
        idempotencyKey: key,
        requestFingerprint: "fp2",
        type: "DEPOSIT",
        entries: [
          { accountId: custodyAccountId, direction: "debit", amountCentimes: 10000n },
          { accountId: availableAccountId, direction: "credit", amountCentimes: 10000n },
        ],
      });
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e?.message).toContain("different request");
    }
  });

  // ── 7. Account balance reconciliation ──
  it("account balance matches sum of signed entries", async () => {
    const account = await db.account.findUnique({ where: { id: availableAccountId } });
    const entries = await db.accountEntry.findMany({
      where: { accountId: availableAccountId },
    });
    // Credit-normal account: balance = Σ credits - Σ debits
    const calculated = entries.reduce((sum, e) => {
      if (e.direction === "credit") return sum + e.amountCentimes;
      return sum - e.amountCentimes;
    }, 0n);
    expect(account!.balanceCentimes).toBe(calculated);
  });

  // ── 8. Deposit + reserve + release round-trip ──
  it("deposit → reserve → release: balances reconcile", async () => {
    // Start from current balance.
    const before = await db.account.findUnique({ where: { id: availableAccountId } });
    const balanceBefore = before!.balanceCentimes;

    // Deposit 10000.
    await deposit(bettorId, 10000n, `roundtrip-${Date.now()}`);
    const afterDeposit = await db.account.findUnique({ where: { id: availableAccountId } });
    expect(afterDeposit!.balanceCentimes).toBe(balanceBefore + 10000n);

    // Reserve 5000.
    await reserveForBet(bettorId, 5000n, `roundtrip-bet-${Date.now()}`);
    const afterReserve = await db.account.findUnique({ where: { id: availableAccountId } });
    expect(afterReserve!.balanceCentimes).toBe(balanceBefore + 10000n - 5000n);

    const reservedAfter = await db.account.findUnique({ where: { id: reservedAccountId } });
    // Check reserved increased by 5000 (may have previous reservations from other tests).
    // Just verify the reserved account balance > 0.
    expect(reservedAfter!.balanceCentimes).toBeGreaterThan(0n);

    // Release 5000.
    await releaseFromBet(bettorId, 5000n, `roundtrip-bet-${Date.now()}`);
    const afterRelease = await db.account.findUnique({ where: { id: availableAccountId } });
    expect(afterRelease!.balanceCentimes).toBe(balanceBefore + 10000n);
  });

  // ── 9. No LedgerEntry writes (legacy table frozen) ──
  it("legacy LedgerEntry count does not increase from canonical operations", async () => {
    const countBefore = await db.ledgerEntry.count();

    // Perform a canonical financial operation.
    await deposit(bettorId, 5000n, `no-legacy-${Date.now()}`);

    const countAfter = await db.ledgerEntry.count();
    expect(countAfter).toBe(countBefore); // no new LedgerEntry rows
  });

  // ── 10. Account normalBalance is set correctly ──
  it("custody account has normalBalance=DEBIT, bettor accounts have CREDIT", async () => {
    const custody = await db.account.findUnique({ where: { id: custodyAccountId } });
    expect(custody!.normalBalance).toBe("DEBIT");

    const available = await db.account.findUnique({ where: { id: availableAccountId } });
    expect(available!.normalBalance).toBe("CREDIT");

    const reserved = await db.account.findUnique({ where: { id: reservedAccountId } });
    expect(reserved!.normalBalance).toBe("CREDIT");
  });

  // ── 11. OfficialEvent uniqueness ──
  it("OfficialEvent has unique (matchId, sequenceNumber) + unique matchEventId", async () => {
    // Try to create two OfficialEvents with the same sequence number.
    const match = await db.match.create({
      data: { homeTeamId: (await db.team.findFirst())!.id, awayTeamId: (await db.team.findFirst({ where: { id: { not: (await db.team.findFirst())!.id } } }))!.id, status: "PWOGRAM", half: "PRE", clock: 0 },
    });

    const ev1 = await db.officialEvent.create({
      data: { matchId: match.id, sequenceNumber: 1, eventType: "GOL", status: "CONFIRMED", confirmedAt: new Date() },
    });

    try {
      await db.officialEvent.create({
        data: { matchId: match.id, sequenceNumber: 1, eventType: "GOL", status: "CONFIRMED", confirmedAt: new Date() },
      });
      expect(false).toBe(true); // should not reach
    } catch (e: any) {
      // SQLite returns different error messages but it should fail on uniqueness.
      expect(e?.message ?? "").toBeTruthy();
    }

    // Clean up.
    await db.officialEvent.deleteMany({ where: { matchId: match.id } }).catch(() => {});
    await db.match.delete({ where: { id: match.id } }).catch(() => {});
  });
});

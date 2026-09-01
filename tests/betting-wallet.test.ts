// FIFAYITI PARIAJ — test: wallet double-spend protection.
//
// Tests that two concurrent bets on the same wallet with exactly the
// available balance result in only ONE success (the other is rejected
// with "Solde disponib ou pa ase.").
//
// Run: bun test tests/betting-wallet.test.ts

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/betting/bettor-session";
import { deposit, getWallet } from "../src/lib/betting/wallet";

describe("Wallet double-spend protection", () => {
  let bettorId: string;

  beforeAll(async () => {
    // Create a test bettor.
    const bettor = await db.bettor.create({
      data: {
        email: `test-wallet-${Date.now()}@test.com`,
        passwordHash: hashPassword("test123456"),
        status: "ACTIVE",
      },
    });
    bettorId = bettor.id;

    // Deposit exactly 500 HTG (50000 centimes).
    await deposit(bettorId, 50000n, "test-deposit");

    const wallet = await getWallet(bettorId);
    expect(wallet?.availableCentimes).toBe(50000n);
  });

  afterAll(async () => {
    // Clean up.
    await db.ledgerEntry.deleteMany({ where: { bettorId } });
    await db.wallet.deleteMany({ where: { bettorId } });
    await db.bettor.delete({ where: { id: bettorId } });
    await db.$disconnect();
  });

  it("should reject the second concurrent bet when both target the full balance", async () => {
    // Two concurrent reservations of 50000 centimes each.
    const p1 = (async () => {
      const { reserveForBet } = await import("../src/lib/betting/wallet");
      return reserveForBet(bettorId, 50000n, "bet-1");
    })();
    const p2 = (async () => {
      const { reserveForBet } = await import("../src/lib/betting/wallet");
      // Small delay to ensure p1 starts first.
      await new Promise((r) => setTimeout(r, 10));
      return reserveForBet(bettorId, 50000n, "bet-2");
    })();

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    // Exactly one should succeed, the other should reject.
    const successes = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const failures = [r1, r2].filter((r) => r.status === "rejected").length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // The failure should be the "insufficient balance" error.
    const failed = [r1, r2].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason.message).toContain("Solde disponib");
  });

  it("should report the correct balance after reservation", async () => {
    const wallet = await getWallet(bettorId);
    // After the successful reservation of 50000, available should be 0
    // and reserved should be 50000.
    expect(wallet?.availableCentimes).toBe(0n);
    expect(wallet?.reservedCentimes).toBe(50000n);
  });
});

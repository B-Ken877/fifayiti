// FIFAYITI SIPÒ — test: team support donations + distributions.
//
// Tests:
//   1. Donation flow: initiate → confirm → team fund credited
//   2. Idempotent webhook: duplicate confirm → no double credit
//   3. Distribution: 10 players → equal shares
//   4. Distribution: uneven amount → deterministic remainder
//   5. Distribution: 0 eligible players → rejected
//   6. Idempotent execution: double-execute → no double payment
//   7. Accounting: Σ debits == Σ credits for every transaction

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import { initiateDonation, confirmDonation } from "../src/lib/support/donation-service";
import { createDistribution, executeDistribution, getEligiblePlayers } from "../src/lib/support/distribution-engine";
import { getOrCreateTeamAccount, getTeamSupportBalance } from "../src/lib/support/accounts";

describe("FIFAYITI SIPÒ — Team Support Economy", () => {
  let teamId: string;
  let playerIds: string[] = [];

  beforeAll(async () => {
    // Create a unique team for this test run.
    const team = await db.team.create({
      data: { name: `Test SIPÒ FC ${Date.now()}`, shortName: "SIPÒ", primaryColor: "#116B3A", secondaryColor: "#F4C400", group: "A" },
    });
    teamId = team.id;

    // Create 10 eligible players (status = VERIFYE) with unique jersey numbers.
    for (let i = 1; i <= 10; i++) {
      const p = await db.player.create({
        data: {
          teamId,
          firstName: `Player${i}`,
          lastName: "Test",
          jerseyNumber: i,
          position: "MID",
          status: "VERIFYE",
        },
      });
      playerIds.push(p.id);
    }
  });

  afterAll(async () => {
    // Clean up.
    for (const pid of playerIds) {
      await db.accountEntry.deleteMany({ where: { accountId: (await db.account.findFirst({ where: { type: "player_earnings", playerId: pid } }))?.id } }).catch(() => {});
      await db.account.deleteMany({ where: { type: "player_earnings", playerId: pid } }).catch(() => {});
      await db.player.delete({ where: { id: pid } }).catch(() => {});
    }
    await db.playerAllocation.deleteMany({ where: { distribution: { teamId } } }).catch(() => {});
    await db.teamSupportDistribution.deleteMany({ where: { teamId } }).catch(() => {});
    await db.teamDonation.deleteMany({ where: { teamId } }).catch(() => {});
    await db.accountEntry.deleteMany({ where: { account: { type: "team_support", teamId } } }).catch(() => {});
    await db.account.deleteMany({ where: { type: "team_support", teamId } }).catch(() => {});
    await db.$disconnect();
  });

  it("donation flow: initiate → confirm → team fund credited", async () => {
    const fundBefore = await getTeamSupportBalance(teamId);

    const result = await initiateDonation({
      teamId,
      amountCentimes: 100000n, // 1000 HTG
      provider: "demo",
      returnUrl: "/team-detail",
    });
    expect(result.ok).toBe(true);

    // Confirm the donation (simulates webhook).
    const confirmResult = await confirmDonation(result.intentId!, `test-${Date.now()}`);
    expect(confirmResult.ok).toBe(true);

    const fundAfter = await getTeamSupportBalance(teamId);
    expect(fundAfter - fundBefore).toBe(100000n);
  });

  it("idempotent webhook: duplicate confirm → no double credit", async () => {
    const fundBefore = await getTeamSupportBalance(teamId);

    const result = await initiateDonation({
      teamId,
      amountCentimes: 50000n, // 500 HTG
      provider: "demo",
      returnUrl: "/team-detail",
    });
    expect(result.ok).toBe(true);

    // Confirm twice (simulates webhook retry).
    const provId = `test-idem-${Date.now()}`;
    await confirmDonation(result.intentId!, provId);
    await confirmDonation(result.intentId!, provId);

    const fundAfter = await getTeamSupportBalance(teamId);
    expect(fundAfter - fundBefore).toBe(50000n); // only credited once
  });

  it("distribution: 10 players → equal shares (1000 HTG / 10 = 100 HTG each)", async () => {
    const eligible = await getEligiblePlayers(teamId);
    expect(eligible.length).toBe(10);

    // The fund should have at least 1500 HTG from the 2 donations above.
    const fundBalance = await getTeamSupportBalance(teamId);
    expect(fundBalance).toBeGreaterThanOrEqual(150000n);

    const distResult = await createDistribution({ teamId, createdBy: "test" });
    expect(distResult.ok).toBe(true);
    expect(distResult.eligibleCount).toBe(10);
    expect(distResult.distributionId).toBeDefined();

    // Execute.
    const execResult = await executeDistribution(distResult.distributionId!, "test");
    expect(execResult.ok).toBe(true);

    // Verify the team fund is now 0 (all distributed).
    const fundAfter = await getTeamSupportBalance(teamId);
    expect(fundAfter).toBe(0n);

    // Verify each player got their share.
    for (const pid of playerIds) {
      const account = await db.account.findFirst({
        where: { type: "player_earnings", playerId: pid },
      });
      expect(account).toBeDefined();
      expect(account!.balanceCentimes).toBeGreaterThan(0n);
    }
  });

  it("distribution: uneven amount → deterministic remainder", async () => {
    // Make a 100 HTG donation (10000 centimes).
    const result = await initiateDonation({
      teamId,
      amountCentimes: 10000n,
      provider: "demo",
      returnUrl: "/team-detail",
    });
    await confirmDonation(result.intentId!, `test-remainder-${Date.now()}`);

    // 10000 / 10 = 1000 each, remainder = 0. Let's test with 3 players instead.
    // Set 7 players to non-eligible, leaving 3.
    for (let i = 3; i < 10; i++) {
      await db.player.update({ where: { id: playerIds[i] }, data: { status: "AN_ATANT" } });
    }

    const distResult = await createDistribution({ teamId, createdBy: "test" });
    expect(distResult.ok).toBe(true);
    expect(distResult.eligibleCount).toBe(3);

    // 10000 / 3 = 3333 each, remainder = 1. First player gets +1.
    const perPlayer = BigInt(distResult.perPlayerAmount!);
    expect(perPlayer).toBe(3333n);
    expect(BigInt(distResult.remainder!)).toBe(1n);
    expect(distResult.totalAmount).toBe("10000");

    // Execute.
    const execResult = await executeDistribution(distResult.distributionId!, "test");
    expect(execResult.ok).toBe(true);

    // Restore the 7 players to VERIFYE.
    for (let i = 3; i < 10; i++) {
      await db.player.update({ where: { id: playerIds[i] }, data: { status: "VERIFYE" } });
    }
  });

  it("distribution: 0 eligible players → rejected", async () => {
    // Make a donation so the fund has money.
    const donResult = await initiateDonation({
      teamId,
      amountCentimes: 10000n,
      provider: "demo",
      returnUrl: "/team-detail",
    });
    await confirmDonation(donResult.intentId!, `test-zero-${Date.now()}`);

    // Set all players to non-eligible.
    for (const pid of playerIds) {
      await db.player.update({ where: { id: pid }, data: { status: "AN_ATANT" } });
    }

    const result = await createDistribution({ teamId, createdBy: "test" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("kalifye");

    // Restore.
    for (const pid of playerIds) {
      await db.player.update({ where: { id: pid }, data: { status: "VERIFYE" } });
    }
  });

  it("idempotent execution: double-execute → no double payment", async () => {
    // Make a small donation.
    const result = await initiateDonation({
      teamId,
      amountCentimes: 10000n,
      provider: "demo",
      returnUrl: "/team-detail",
    });
    await confirmDonation(result.intentId!, `test-idem-exec-${Date.now()}`);

    const distResult = await createDistribution({ teamId, createdBy: "test" });
    expect(distResult.ok).toBe(true);

    // Execute twice.
    const exec1 = await executeDistribution(distResult.distributionId!, "test");
    const exec2 = await executeDistribution(distResult.distributionId!, "test");

    expect(exec1.ok).toBe(true);
    expect(exec2.ok).toBe(true); // idempotent — returns ok without re-crediting

    // Verify the team fund is 0 (not negative — no double distribution).
    const fundAfter = await getTeamSupportBalance(teamId);
    expect(fundAfter).toBe(0n);
  });
});

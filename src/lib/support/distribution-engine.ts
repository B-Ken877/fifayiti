// FIFAYITI SIPÒ — Distribution engine.
//
// FIFAYITI (not coaches) distributes the team's support pool equally
// among eligible players. The distribution is:
//   - ATOMIC: either all player allocations succeed or nothing changes
//   - IDEMPOTENT: batchNumber is unique per team (double-click rejected)
//   - IMMUTABLE: the eligibility snapshot is frozen at creation time
//   - DETERMINISTIC: remainder is distributed to the first N players
//     (each gets +1 centime), where N = totalAmount % playerCount
//
// ELIGIBILITY: players with status = "VERIFYE" on the team. The snapshot
// is a JSON array stored on the distribution record so historical
// distributions can't silently change when the roster changes.

import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import {
  getOrCreateTeamAccount,
  getOrCreatePlayerAccount,
  getOrCreateCustodyAccount,
  postDoubleEntry,
} from "./accounts";

/** Get the eligible players for a team (status = VERIFYE). */
export async function getEligiblePlayers(teamId: string) {
  return db.player.findMany({
    where: { teamId, status: "VERIFYE" },
    orderBy: { jerseyNumber: "asc" },
    select: { id: true, firstName: true, lastName: true, jerseyNumber: true },
  });
}

/**
 * Create a distribution batch (DRAFT status).
 *
 * Snapshots the eligible players + calculates equal shares + remainder.
 * Does NOT move any money. The admin must review + execute separately.
 *
 * IDEMPOTENCY: batchNumber is monotonic per team. A double-submit hits
 * the @@unique([teamId, batchNumber]) constraint.
 */
export async function createDistribution(opts: {
  teamId: string;
  createdBy: string;
}): Promise<{
  ok: boolean;
  distributionId?: string;
  batchNumber?: number;
  eligibleCount?: number;
  perPlayerAmount?: string;
  totalAmount?: string;
  remainder?: string;
  reason?: string;
}> {
  // Get the team's support fund balance.
  const teamAccount = await getOrCreateTeamAccount(opts.teamId);
  const fundBalance = teamAccount.balanceCentimes;

  if (fundBalance <= 0n) {
    return { ok: false, reason: "Pa gen lajan nan fon sipò a." };
  }

  // Get eligible players.
  const eligible = await getEligiblePlayers(opts.teamId);
  if (eligible.length === 0) {
    return { ok: false, reason: "Pa gen jwè ki kalifye pou distribisyon." };
  }

  // Calculate equal shares + deterministic remainder.
  const perPlayer = fundBalance / BigInt(eligible.length);
  const remainder = fundBalance % BigInt(eligible.length);
  // First N players (by jerseyNumber) get +1 centime.
  const remainderRecipients = Number(remainder);

  // Get the next batch number (monotonic per team).
  const lastBatch = await db.teamSupportDistribution.findFirst({
    where: { teamId: opts.teamId },
    orderBy: { batchNumber: "desc" },
    select: { batchNumber: true },
  });
  const batchNumber = (lastBatch?.batchNumber ?? 0) + 1;

  // Create the distribution record (DRAFT) with the eligibility snapshot.
  const snapshot = eligible.map((p) => ({
    playerId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    jerseyNumber: p.jerseyNumber,
  }));

  const distribution = await db.teamSupportDistribution.create({
    data: {
      teamId: opts.teamId,
      batchNumber,
      status: "DRAFT",
      totalAmountCentimes: fundBalance,
      eligiblePlayerCount: eligible.length,
      perPlayerAmountCentimes: perPlayer,
      remainderCentimes: remainder,
      remainderRecipients,
      eligibilitySnapshot: JSON.stringify(snapshot),
      createdBy: opts.createdBy,
    },
  });

  // Create the player allocations (child records).
  for (let i = 0; i < eligible.length; i++) {
    const player = eligible[i];
    const amount = perPlayer + (i < remainderRecipients ? 1n : 0n);
    await db.playerAllocation.create({
      data: {
        distributionId: distribution.id,
        playerId: player.id,
        playerName: `${player.firstName} ${player.lastName}`,
        playerJerseyNumber: player.jerseyNumber,
        amountCentimes: amount,
      },
    });
  }

  return {
    ok: true,
    distributionId: distribution.id,
    batchNumber,
    eligibleCount: eligible.length,
    perPlayerAmount: perPlayer.toString(),
    totalAmount: fundBalance.toString(),
    remainder: remainder.toString(),
  };
}

/**
 * Execute a distribution — atomically credit all player accounts.
 *
 * Either ALL allocations succeed or nothing changes (Prisma transaction).
 * The distribution's status transitions: DRAFT → EXECUTING → COMPLETED.
 *
 * IDEMPOTENT: if the distribution is already COMPLETED, returns without
 * re-crediting.
 */
export async function executeDistribution(
  distributionId: string,
  executedBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  const distribution = await db.teamSupportDistribution.findUnique({
    where: { id: distributionId },
    include: { allocations: true },
  });
  if (!distribution) return { ok: false, reason: "distribution not found" };
  if (distribution.status === "COMPLETED") return { ok: true }; // idempotent
  if (distribution.status !== "DRAFT" && distribution.status !== "PENDING") {
    return { ok: false, reason: `distribution is ${distribution.status}` };
  }

  try {
    return await db.$transaction(async (tx) => {
      // Transition to EXECUTING (idempotency guard — a second call sees EXECUTING).
      await tx.teamSupportDistribution.update({
        where: { id: distributionId },
        data: { status: "EXECUTING", executedBy, executedAt: new Date() },
      });

      // Get the team account.
      const teamAccount = await tx.account.findFirst({
        where: { type: "team_support", teamId: distribution.teamId },
      });
      if (!teamAccount) throw new Error("team account not found");

      // Verify the team fund has enough.
      if (teamAccount.balanceCentimes < distribution.totalAmountCentimes) {
        throw new Error("Insufficient team fund for distribution.");
      }

      // Post the main debit: team_support → players (debits the team fund).
      const mainTxnId = randomUUID();
      await tx.account.update({
        where: { id: teamAccount.id },
        data: { balanceCentimes: teamAccount.balanceCentimes - distribution.totalAmountCentimes },
      });
      await tx.accountEntry.create({
        data: {
          transactionId: mainTxnId,
          accountId: teamAccount.id,
          direction: "debit",
          amountCentimes: distribution.totalAmountCentimes,
          ledgerType: "TEAM_DISTRIBUTION",
          referenceType: "team_support_distribution",
          referenceId: distributionId,
          metadata: JSON.stringify({
            teamId: distribution.teamId,
            batchNumber: distribution.batchNumber,
            playerCount: distribution.eligiblePlayerCount,
          }),
        },
      });

      // Credit each player's earnings account.
      for (const allocation of distribution.allocations) {
        let playerAccount = await tx.account.findFirst({
          where: { type: "player_earnings", playerId: allocation.playerId },
        });
        if (!playerAccount) {
          playerAccount = await tx.account.create({
            data: { type: "player_earnings", playerId: allocation.playerId, currency: "HTG" },
          });
        }

        // Credit the player's account + create an AccountEntry.
        const playerTxnId = randomUUID();
        await tx.account.update({
          where: { id: playerAccount.id },
          data: { balanceCentimes: playerAccount.balanceCentimes + allocation.amountCentimes },
        });
        await tx.accountEntry.create({
          data: {
            transactionId: playerTxnId,
            accountId: playerAccount.id,
            direction: "credit",
            amountCentimes: allocation.amountCentimes,
            ledgerType: "PLAYER_ALLOCATION",
            referenceType: "player_allocation",
            referenceId: allocation.id,
            metadata: JSON.stringify({
              distributionId,
              playerId: allocation.playerId,
              playerName: allocation.playerName,
            }),
          },
        });

        // Mark the allocation as credited.
        await tx.playerAllocation.update({
          where: { id: allocation.id },
          data: {
            status: "CREDITED",
            ledgerTransactionId: playerTxnId,
            creditedAt: new Date(),
          },
        });
      }

      // Mark the distribution as completed.
      await tx.teamSupportDistribution.update({
        where: { id: distributionId },
        data: {
          status: "COMPLETED",
          ledgerTransactionId: mainTxnId,
          completedAt: new Date(),
        },
      });

      return { ok: true };
    });
  } catch (e: any) {
    // Roll back to DRAFT on failure (the tx already rolled back the accounts).
    await db.teamSupportDistribution.update({
      where: { id: distributionId },
      data: { status: "FAILED", failureReason: e?.message },
    }).catch(() => {});
    return { ok: false, reason: e?.message ?? "execution failed" };
  }
}

/**
 * Get the distribution history for a team.
 */
export async function getDistributionHistory(teamId: string) {
  return db.teamSupportDistribution.findMany({
    where: { teamId },
    include: { allocations: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

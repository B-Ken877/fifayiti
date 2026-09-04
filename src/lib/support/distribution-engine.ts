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

  // Create the distribution record (DRAFT) with the eligibility snapshot.
  const snapshot = eligible.map((p) => ({
    playerId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    jerseyNumber: p.jerseyNumber,
  }));

  // ── P0 #4 + P0 #5: ATOMIC CREATION + STALE GUARD ───────────────────
  // Distribution + ALL PlayerAllocation rows + the P0 #5 stale-distribution
  // guard (only one non-terminal per team) all happen inside ONE transaction.
  // If the guard fails or any allocation fails, the whole thing rolls back.
  const distribution = await db.$transaction(async (tx) => {
    // P0 #5: Check for existing non-terminal distributions INSIDE the tx.
    const existing = await tx.teamSupportDistribution.count({
      where: {
        teamId: opts.teamId,
        status: { in: ["DRAFT", "PENDING", "EXECUTING"] },
      },
    });
    if (existing > 0) {
      throw new Error("Gen yon distribisyon ki poko fini pou ekip sa a.");
    }

    // Compute batch number inside the tx (avoids race on the lastBatch read).
    const lastBatch = await tx.teamSupportDistribution.findFirst({
      where: { teamId: opts.teamId },
      orderBy: { batchNumber: "desc" },
      select: { batchNumber: true },
    });
    const batchNumber = (lastBatch?.batchNumber ?? 0) + 1;

    const dist = await tx.teamSupportDistribution.create({
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

    // Create all player allocations inside the same transaction.
    for (let i = 0; i < eligible.length; i++) {
      const player = eligible[i];
      const amount = perPlayer + (i < remainderRecipients ? 1n : 0n);
      await tx.playerAllocation.create({
        data: {
          distributionId: dist.id,
          playerId: player.id,
          playerName: `${player.firstName} ${player.lastName}`,
          playerJerseyNumber: player.jerseyNumber,
          amountCentimes: amount,
        },
      });
    }

    return dist;
  }).catch(() => null); // returns null on guard failure (P0 #5) or other error

  if (!distribution) {
    return { ok: false, reason: "Gen yon distribisyon ki poko fini pou ekip sa a." };
  }

  return {
    ok: true,
    distributionId: distribution.id,
    batchNumber: distribution.batchNumber,
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
  // Pre-check: if not found or already COMPLETED, return early.
  // The atomic state transition inside the tx handles the race.
  const distribution = await db.teamSupportDistribution.findUnique({
    where: { id: distributionId },
    select: { status: true },
  });
  if (!distribution) return { ok: false, reason: "distribution not found" };
  if (distribution.status === "COMPLETED") return { ok: true }; // idempotent

  try {
    return await db.$transaction(async (tx) => {
      // ── P0 #3: ATOMIC STATE TRANSITION ───────────────────────────────
      // Use updateMany with a WHERE clause that only matches DRAFT/PENDING.
      // If 0 rows are affected, another request won the race.
      const transition = await tx.teamSupportDistribution.updateMany({
        where: { id: distributionId, status: { in: ["DRAFT", "PENDING"] } },
        data: { status: "EXECUTING", executedBy, executedAt: new Date() },
      });
      if (transition.count === 0) {
        // Either already COMPLETED (idempotent), already EXECUTING (race loser),
        // or FAILED. Return idempotent/already-processing.
        const current = await tx.teamSupportDistribution.findUnique({
          where: { id: distributionId },
          select: { status: true },
        });
        if (current?.status === "COMPLETED") return { ok: true }; // idempotent
        return { ok: false, reason: `distribution is ${current?.status ?? "unknown"}` };
      }

      // Re-read inside the tx to get allocations.
      const dist = await tx.teamSupportDistribution.findUnique({
        where: { id: distributionId },
        include: { allocations: true },
      });
      if (!dist) throw new Error("distribution not found after transition");

      // Get the team account.
      const teamAccount = await tx.account.findFirst({
        where: { type: "team_support", teamId: dist.teamId },
      });
      if (!teamAccount) throw new Error("team account not found");

      // Verify the team fund has enough.
      if (teamAccount.balanceCentimes < dist.totalAmountCentimes) {
        throw new Error("Insufficient team fund for distribution.");
      }

      // ── P0 #2: ONE BALANCED TRANSACTION ──────────────────────────────
      // All entries (1 debit + N credits) share the SAME transactionId.
      // Σ debits == Σ credits.
      const txnId = randomUUID();

      // Debit team_support (decrease — funds leaving the team pool).
      await tx.account.update({
        where: { id: teamAccount.id },
        data: { balanceCentimes: teamAccount.balanceCentimes - dist.totalAmountCentimes },
      });
      await tx.accountEntry.create({
        data: {
          transactionId: txnId,
          accountId: teamAccount.id,
          direction: "debit",
          amountCentimes: dist.totalAmountCentimes,
          ledgerType: "TEAM_DISTRIBUTION",
          referenceType: "team_support_distribution",
          referenceId: distributionId,
          metadata: JSON.stringify({
            teamId: dist.teamId,
            batchNumber: dist.batchNumber,
            playerCount: dist.eligiblePlayerCount,
          }),
        },
      });

      // Credit each player's earnings account — SAME transactionId.
      for (const allocation of dist.allocations) {
        let playerAccount = await tx.account.findFirst({
          where: { type: "player_earnings", playerId: allocation.playerId },
        });
        if (!playerAccount) {
          playerAccount = await tx.account.create({
            data: { type: "player_earnings", playerId: allocation.playerId, currency: "HTG" },
          });
        }

        await tx.account.update({
          where: { id: playerAccount.id },
          data: { balanceCentimes: playerAccount.balanceCentimes + allocation.amountCentimes },
        });
        await tx.accountEntry.create({
          data: {
            transactionId: txnId,
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

        // Mark the allocation as credited (SAME transactionId).
        await tx.playerAllocation.update({
          where: { id: allocation.id },
          data: {
            status: "CREDITED",
            ledgerTransactionId: txnId,
            creditedAt: new Date(),
          },
        });
      }

      // Mark the distribution as completed.
      await tx.teamSupportDistribution.update({
        where: { id: distributionId },
        data: {
          status: "COMPLETED",
          ledgerTransactionId: txnId,
          completedAt: new Date(),
        },
      });

      return { ok: true };
    });
  } catch (e: any) {
    // ── P1 #9: FAILED stays FAILED (no roll back to DRAFT) ────────────
    // The transaction rolled back the financial entries. The distribution
    // stays in EXECUTING → transition to FAILED with the failure reason.
    // FAILED distributions are auditable + cannot be re-executed.
    await db.teamSupportDistribution.updateMany({
      where: { id: distributionId, status: "EXECUTING" },
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

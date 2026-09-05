// FIFAYITI SIPÒ — Distribution engine (canonical ledger edition).
//
// FIFAYITI (not coaches) distributes the team's support pool equally
// among eligible players. Uses the canonical postFinancialTransaction to
// create ONE balanced FinancialTransaction with:
//   DEBIT  team_support (the full pool)
//   CREDIT player_earnings[0..N] (each player's share)
//
// All entries share the same FinancialTransaction ID. Σ debits == Σ credits.

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { postFinancialTransaction } from "@/lib/finance/ledger";
import {
  getOrCreateTeamAccount,
  getOrCreatePlayerAccount,
} from "@/lib/support/accounts";

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function getEligiblePlayers(teamId: string) {
  return db.player.findMany({
    where: { teamId, status: "VERIFYE" },
    orderBy: { jerseyNumber: "asc" },
    select: { id: true, firstName: true, lastName: true, jerseyNumber: true },
  });
}

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
  const teamAccount = await getOrCreateTeamAccount(opts.teamId);
  const fundBalance = teamAccount.balanceCentimes;

  if (fundBalance <= 0n) {
    return { ok: false, reason: "Pa gen lajan nan fon sipò a." };
  }

  const eligible = await getEligiblePlayers(opts.teamId);
  if (eligible.length === 0) {
    return { ok: false, reason: "Pa gen jwè ki kalifye pou distribisyon." };
  }

  const perPlayer = fundBalance / BigInt(eligible.length);
  const remainder = fundBalance % BigInt(eligible.length);
  const remainderRecipients = Number(remainder);

  const snapshot = eligible.map((p) => ({
    playerId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    jerseyNumber: p.jerseyNumber,
  }));

  const distribution = await db.$transaction(async (tx) => {
    const existing = await tx.teamSupportDistribution.count({
      where: {
        teamId: opts.teamId,
        status: { in: ["DRAFT", "PENDING", "EXECUTING"] },
      },
    });
    if (existing > 0) {
      throw new Error("Gen yon distribisyon ki poko fini pou ekip sa a.");
    }

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
  }).catch(() => null);

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

export async function executeDistribution(
  distributionId: string,
  executedBy: string,
): Promise<{ ok: boolean; reason?: string }> {
  const distribution = await db.teamSupportDistribution.findUnique({
    where: { id: distributionId },
    select: { status: true },
  });
  if (!distribution) return { ok: false, reason: "distribution not found" };
  if (distribution.status === "COMPLETED") return { ok: true };

  try {
    return await db.$transaction(async (tx) => {
      const transition = await tx.teamSupportDistribution.updateMany({
        where: { id: distributionId, status: { in: ["DRAFT", "PENDING"] } },
        data: { status: "EXECUTING", executedBy, executedAt: new Date() },
      });
      if (transition.count === 0) {
        const current = await tx.teamSupportDistribution.findUnique({
          where: { id: distributionId },
          select: { status: true },
        });
        if (current?.status === "COMPLETED") return { ok: true };
        return { ok: false, reason: `distribution is ${current?.status ?? "unknown"}` };
      }

      const dist = await tx.teamSupportDistribution.findUnique({
        where: { id: distributionId },
        include: { allocations: true },
      });
      if (!dist) throw new Error("distribution not found after transition");

      // Verify team fund has enough (inside the tx).
      const teamAccount = await getOrCreateTeamAccount(dist.teamId);
      if (teamAccount.balanceCentimes < dist.totalAmountCentimes) {
        throw new Error("Insufficient team fund for distribution.");
      }

      // Build the entries for the canonical financial transaction.
      const entries: { accountId: string; direction: "debit" | "credit"; amountCentimes: bigint }[] = [
        { accountId: teamAccount.id, direction: "debit", amountCentimes: dist.totalAmountCentimes },
      ];

      for (const allocation of dist.allocations) {
        const playerAccount = await getOrCreatePlayerAccount(allocation.playerId);
        entries.push({
          accountId: playerAccount.id,
          direction: "credit",
          amountCentimes: allocation.amountCentimes,
        });
      }

      // Post the financial transaction using the canonical ledger.
      // This creates the FinancialTransaction + AccountEntry rows + updates Account balances.
      const result = await postFinancialTransaction({
        idempotencyKey: `team_distribution:${dist.id}`,
        requestFingerprint: fingerprint([
          "TEAM_DISTRIBUTION",
          dist.id,
          dist.teamId,
          dist.totalAmountCentimes.toString(),
          dist.eligiblePlayerCount.toString(),
          ...dist.allocations.map((a: any) => `${a.playerId}:${a.amountCentimes.toString()}`),
        ]),
        type: "TEAM_DISTRIBUTION",
        referenceType: "team_support_distribution",
        referenceId: distributionId,
        metadata: JSON.stringify({
          teamId: dist.teamId,
          batchNumber: dist.batchNumber,
          playerCount: dist.eligiblePlayerCount,
          totalAmount: dist.totalAmountCentimes.toString(),
        }),
        createdBy: executedBy,
        entries,
      });

      // Mark all allocations as credited.
      for (const allocation of dist.allocations) {
        await tx.playerAllocation.update({
          where: { id: allocation.id },
          data: {
            status: "CREDITED",
            ledgerTransactionId: result.transactionId,
            creditedAt: new Date(),
          },
        });
      }

      // Mark the distribution as completed.
      await tx.teamSupportDistribution.update({
        where: { id: distributionId },
        data: {
          status: "COMPLETED",
          ledgerTransactionId: result.transactionId,
          completedAt: new Date(),
        },
      });

      return { ok: true };
    });
  } catch (e: any) {
    await db.teamSupportDistribution.updateMany({
      where: { id: distributionId, status: "EXECUTING" },
      data: { status: "FAILED", failureReason: e?.message },
    }).catch(() => {});
    return { ok: false, reason: e?.message ?? "execution failed" };
  }
}

export async function getDistributionHistory(teamId: string) {
  return db.teamSupportDistribution.findMany({
    where: { teamId },
    include: { allocations: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

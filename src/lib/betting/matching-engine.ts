// FIFAYITI PARIAJ — Matching engine (exact-stake P2P, canonical ledger edition).
//
// RULES (per spec §8):
//   A bet matches ONLY another opposing bet with the EXACT same stake.
//   500 ↔ 500 = MATCH.  500 ↔ 250 = NO MATCH.  500 ↔ (250+250) = NO MATCH.
//
// MATCHING CRITERIA:
//   - same match
//   - same market
//   - same market version (same marketId)
//   - OPPOSING selections (different selectionId)
//   - exact same stake (same stakeCentimes)
//   - both orders in OPEN status
//   - market is OPEN
//
// ATOMICITY:
//   The match happens inside a single Prisma transaction. Both orders are
//   moved from OPEN → MATCHED, their matchedWithId cross-references are
//   set, and the reserved funds are moved to platform custody via the
//   canonical financial ledger. No LedgerEntry writes.
//
// The matching engine calls matchBetFunds() from wallet.ts which now uses
// postFinancialTransaction — the canonical ledger. The Wallet projection is
// synced after the match.

import { db } from "@/lib/db";
import { matchBetFunds, releaseFromBet } from "./wallet";

export interface MatchResult {
  matched: boolean;
  betOrder?: any;
  opposingOrder?: any;
  reason?: string;
}

export async function tryMatch(newBetOrderId: string): Promise<MatchResult> {
  try {
    return await db.$transaction(async (tx) => {
      const newBet = await tx.betOrder.findUnique({
        where: { id: newBetOrderId },
        include: { market: true, selection: true },
      });
      if (!newBet) return { matched: false, reason: "bet not found" };
      if (newBet.status !== "OPEN") {
        return { matched: false, reason: `bet status is ${newBet.status}` };
      }
      if (newBet.market.status !== "OPEN") {
        return { matched: false, reason: `market is ${newBet.market.status}` };
      }

      const opposing = await tx.betOrder.findFirst({
        where: {
          marketId: newBet.marketId,
          selectionId: { not: newBet.selectionId },
          stakeCentimes: newBet.stakeCentimes,
          status: "OPEN",
          bettorId: { not: newBet.bettorId },
        },
        orderBy: { createdAt: "asc" },
        include: { selection: true, market: true },
      });

      if (!opposing) {
        return { matched: false, reason: "no opposing open bet at this stake" };
      }

      // Serialize market closure/suspension against this match. The no-op
      // update acquires the market row lock without changing its lifecycle.
      const openMarket = await tx.bettingMarket.updateMany({
        where: { id: newBet.marketId, status: "OPEN" },
        data: { status: "OPEN" },
      });
      if (openMarket.count !== 1) return { matched: false, reason: "market is no longer open" };

      // Claim both orders conditionally, and move both stakes from reserved
      // into custody in this same database transaction. Concurrent matchers
      // cannot claim the same order or leave a MATCHED order unfunded.
      const now = new Date();
      const claimedNew = await tx.betOrder.updateMany({
        where: { id: newBet.id, status: "OPEN" },
        data: { status: "MATCHED", matchedWithId: opposing.id, matchedAt: now },
      });
      const claimedOpposing = await tx.betOrder.updateMany({
        where: { id: opposing.id, status: "OPEN" },
        data: { status: "MATCHED", matchedWithId: newBet.id, matchedAt: now },
      });
      if (claimedNew.count !== 1 || claimedOpposing.count !== 1) {
        throw new Error("bet order was claimed by another matcher");
      }

      await matchBetFunds(newBet.bettorId, newBet.stakeCentimes, newBet.id, tx);
      await matchBetFunds(opposing.bettorId, opposing.stakeCentimes, opposing.id, tx);

      return {
        matched: true,
        betOrder: { ...newBet, status: "MATCHED" },
        opposingOrder: { ...opposing, status: "MATCHED" },
      };
    });
  } catch (e: any) {
    console.error("[matching-engine] match failed:", e?.message);
    return { matched: false, reason: e?.message ?? "matching error" };
  }
}

/**
 * Cancel an OPEN (unmatched) bet. Uses the canonical ledger (releaseFromBet).
 */
export async function cancelOpenBet(betOrderId: string, bettorId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const bet = await tx.betOrder.findUnique({ where: { id: betOrderId } });
      if (!bet) return { ok: false, reason: "bet not found" };
      if (bet.bettorId !== bettorId) return { ok: false, reason: "not your bet" };
      if (bet.status !== "OPEN" && bet.status !== "RESERVED") {
        return { ok: false, reason: `bet is ${bet.status} (cannot cancel)` };
      }

      const claimed = await tx.betOrder.updateMany({
        where: { id: betOrderId, bettorId, status: bet.status },
        data: { status: "CANCELLED" },
      });
      if (claimed.count !== 1) return { ok: false, reason: "bet can no longer be cancelled" };

      await releaseFromBet(bettorId, bet.stakeCentimes, betOrderId, tx);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

export async function getMarketLiquidity(marketId: string) {
  const openBets = await db.betOrder.findMany({
    where: { marketId, status: "OPEN" },
    select: { selectionId: true, stakeCentimes: true },
  });

  const map = new Map<string, number>();
  for (const b of openBets) {
    const key = `${b.selectionId}:${b.stakeCentimes.toString()}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([key, count]) => {
    const [selectionId, stake] = key.split(":");
    return {
      selectionId,
      stakeCentimes: BigInt(stake),
      openOrderCount: count,
    };
  });
}

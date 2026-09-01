// FIFAYITI PARIAJ — Matching engine (exact-stake P2P).
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
//   set, and the wallet funds are moved from reserved → in-play (removed
//   from the wallet, tracked by the BetOrder). If anything fails, the
//   whole match rolls back.

import { db } from "@/lib/db";
import { matchBetFunds } from "./wallet";
import { computeCommission } from "./types";

export interface MatchResult {
  matched: boolean;
  betOrder?: any;
  opposingOrder?: any;
  reason?: string;
}

/**
 * Try to match a freshly-opened bet against the pool of open opposing bets.
 *
 * Called immediately after a bet is placed (status OPEN). Scans the order
 * book for the oldest opposing OPEN order at the same stake and matches
 * atomically if found.
 *
 * Returns { matched: true, ... } on success, { matched: false, reason } if
 * no opposing order exists (the bet stays OPEN in the pool).
 */
export async function tryMatch(newBetOrderId: string): Promise<MatchResult> {
  try {
    return await db.$transaction(async (tx) => {
      // 1. Load the new bet (lock it via the transaction).
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

      // 2. Find the oldest opposing OPEN bet at the same stake.
      //    Same market, different selection, same stake, OPEN status.
      //    FIFO ordering (oldest first) — fair to users who waited.
      const opposing = await tx.betOrder.findFirst({
        where: {
          marketId: newBet.marketId,
          selectionId: { not: newBet.selectionId },
          stakeCentimes: newBet.stakeCentimes,
          status: "OPEN",
          bettorId: { not: newBet.bettorId }, // can't match yourself
        },
        orderBy: { createdAt: "asc" },
        include: { selection: true, market: true },
      });

      if (!opposing) {
        return { matched: false, reason: "no opposing open bet at this stake" };
      }

      // 3. Atomically update both orders + move wallet funds.
      const now = new Date();
      await tx.betOrder.update({
        where: { id: newBet.id },
        data: {
          status: "MATCHED",
          matchedWithId: opposing.id,
          matchedAt: now,
        },
      });
      await tx.betOrder.update({
        where: { id: opposing.id },
        data: {
          status: "MATCHED",
          matchedWithId: newBet.id,
          matchedAt: now,
        },
      });

      // 4. Move funds from reserved → in-play for both bettors.
      //    (Inside the same transaction — atomic.)
      for (const bettorId of [newBet.bettorId, opposing.bettorId]) {
        const stake = bettorId === newBet.bettorId ? newBet.stakeCentimes : opposing.stakeCentimes;
        const betId = bettorId === newBet.bettorId ? newBet.id : opposing.id;

        // Re-read wallet inside the tx (optimistic concurrency).
        const wallet = await tx.wallet.findUnique({ where: { bettorId } });
        if (!wallet || wallet.reservedCentimes < stake) {
          throw new Error(`bettor ${bettorId} has insufficient reserved funds`);
        }

        await tx.wallet.update({
          where: { bettorId },
          data: {
            reservedCentimes: wallet.reservedCentimes - stake,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            bettorId,
            amountCentimes: -stake,
            type: "BET_MATCH",
            referenceType: "bet_order",
            referenceId: betId,
            balanceAfterCentimes: wallet.availableCentimes, // available unchanged
            metadata: JSON.stringify({
              action: "match",
              betOrderId: betId,
              matchedWith: bettorId === newBet.bettorId ? opposing.id : newBet.id,
            }),
          },
        });
      }

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
 * Cancel an OPEN (unmatched) bet. Refunds the reserved funds to the
 * bettor's available balance. Atomic.
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

      // Update bet status.
      await tx.betOrder.update({
        where: { id: betOrderId },
        data: { status: "CANCELLED" },
      });

      // Refund reserved funds.
      const wallet = await tx.wallet.findUnique({ where: { bettorId } });
      if (!wallet) return { ok: false, reason: "wallet not found" };

      await tx.wallet.update({
        where: { bettorId },
        data: {
          availableCentimes: wallet.availableCentimes + bet.stakeCentimes,
          reservedCentimes: wallet.reservedCentimes - bet.stakeCentimes,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          bettorId,
          amountCentimes: bet.stakeCentimes,
          type: "BET_RELEASE",
          referenceType: "bet_order",
          referenceId: betOrderId,
          balanceAfterCentimes: wallet.availableCentimes + bet.reservedCentimes,
          metadata: JSON.stringify({ action: "cancel_open", betOrderId }),
        },
      });

      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

/**
 * Get the liquidity (unmatched open bets) for each selection + stake pool.
 * Used by the UI to show available matching liquidity.
 */
export async function getMarketLiquidity(marketId: string) {
  const openBets = await db.betOrder.findMany({
    where: { marketId, status: "OPEN" },
    select: { selectionId: true, stakeCentimes: true },
  });

  // Group by selection × stake.
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

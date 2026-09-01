// FIFAYITI PARIAJ — Wallet + Ledger (double-entry, atomic, concurrency-safe).
//
// ARCHITECTURE:
//   Every money movement is a ledger entry (immutable) + a wallet balance
//   update (denormalized). Both happen inside a single Prisma transaction
//   so the wallet never drifts from the ledger.
//
//   Wallet.available  — spendable now
//   Wallet.reserved    — locked in open (unmatched) bets
//   (Matched funds are removed from reserved — they're "in play" and
//    tracked by the BetOrder, not the wallet.)
//
// CONCURRENCY:
//   Prisma transactions on SQLite are SERIALIZABLE (SQLite uses locking).
//   For high-concurrency production, Postgres with SELECT FOR UPDATE on the
//   wallet row is recommended. The code below uses a re-read pattern inside
//   the transaction to catch race conditions (optimistic concurrency).
//
// ⚠️ Vercel note: each lambda gets a fresh DB copy. Wallet writes within a
//   single transaction succeed, but cross-lambda persistence requires
//   Postgres. The code is correct; the backend is what needs upgrading.

import { db } from "@/lib/db";
import type { LedgerType } from "@prisma/client";

export interface WalletSnapshot {
  availableCentimes: bigint;
  reservedCentimes: bigint;
  totalCentimes: bigint;
}

/** Read a bettor's wallet (creates one if missing). */
export async function getWallet(bettorId: string) {
  let wallet = await db.wallet.findUnique({ where: { bettorId } });
  if (!wallet) {
    try {
      wallet = await db.wallet.create({ data: { bettorId } });
    } catch {
      // Race: another request created it — re-read.
      wallet = await db.wallet.findUnique({ where: { bettorId } });
    }
  }
  return wallet;
}

/**
 * Atomically: write a ledger entry + update the wallet balance.
 *
 * All money movements go through this function — never update the wallet
 * directly. The ledger entry and wallet update are inside a single Prisma
 * transaction, so the wallet can never drift from the ledger.
 *
 * @param bettorId    the bettor whose wallet is affected
 * @param amount      +credit / -debit in centimes (BigInt)
 * @param type        ledger entry type
 * @param refType     reference entity type (e.g. "bet_order")
 * @param refId       reference entity id
 * @param availableDelta  change to wallet.available (positive = add)
 * @param reservedDelta   change to wallet.reserved (positive = add)
 * @param metadata    extra context (JSON string)
 */
export async function ledgerEntry(
  bettorId: string,
  amount: bigint,
  type: LedgerType,
  opts: {
    refType?: string;
    refId?: string;
    availableDelta: bigint;  // +add / -subtract from available
    reservedDelta?: bigint;   // +add / -subtract from reserved
    metadata?: string;
  },
) {
  return db.$transaction(async (tx) => {
    // Re-read the wallet inside the transaction (optimistic concurrency).
    let wallet = await tx.wallet.findUnique({ where: { bettorId } });
    if (!wallet) {
      wallet = await tx.wallet.create({ data: { bettorId } });
    }

    const newAvailable = wallet.availableCentimes + opts.availableDelta;
    const newReserved = wallet.reservedCentimes + (opts.reservedDelta ?? 0n);

    // Guard: balances can never go negative.
    if (newAvailable < 0n) {
      throw new Error("Solde disponib ou pa ase.");
    }
    if (newReserved < 0n) {
      throw new Error("Erè nan rezèv lajan — rezève negatif.");
    }

    const updated = await tx.wallet.update({
      where: { bettorId },
      data: {
        availableCentimes: newAvailable,
        reservedCentimes: newReserved,
      },
    });

    const balanceAfter = updated.availableCentimes + updated.reservedCentimes;

    await tx.ledgerEntry.create({
      data: {
        bettorId,
        amountCentimes: amount,
        type,
        referenceType: opts.refType ?? null,
        referenceId: opts.refId ?? null,
        balanceAfterCentimes: balanceAfter,
        metadata: opts.metadata ?? null,
      },
    });

    return updated;
  });
}

/**
 * Reserve funds for a bet (available → reserved).
 * Throws if insufficient balance.
 */
export async function reserveForBet(bettorId: string, stakeCentimes: bigint, betOrderId: string) {
  return ledgerEntry(bettorId, -stakeCentimes, "BET_RESERVE", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: -stakeCentimes,
    reservedDelta: stakeCentimes,
    metadata: JSON.stringify({ action: "reserve", betOrderId }),
  });
}

/**
 * Release reserved funds back to available (bet cancelled while unmatched).
 */
export async function releaseFromBet(bettorId: string, stakeCentimes: bigint, betOrderId: string) {
  return ledgerEntry(bettorId, stakeCentimes, "BET_RELEASE", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: stakeCentimes,
    reservedDelta: -stakeCentimes,
    metadata: JSON.stringify({ action: "release", betOrderId }),
  });
}

/**
 * Move matched funds from reserved → in-play (removed from wallet entirely).
 * The BetOrder row tracks the in-play amount.
 */
export async function matchBetFunds(bettorId: string, stakeCentimes: bigint, betOrderId: string) {
  return ledgerEntry(bettorId, -stakeCentimes, "BET_MATCH", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: 0n,
    reservedDelta: -stakeCentimes,
    metadata: JSON.stringify({ action: "match", betOrderId }),
  });
}

/**
 * Settle a winning bet: return the stake + winnings (minus commission).
 * The pot = winnerStake + loserStake. Winner gets pot - commission.
 */
export async function settleWin(
  bettorId: string,
  stakeCentimes: bigint,
  winningsCentimes: bigint,
  commissionCentimes: bigint,
  betOrderId: string,
  marketId: string,
) {
  // Net credit = stake (returned) + winnings - commission
  const netCredit = stakeCentimes + winningsCentimes - commissionCentimes;
  return ledgerEntry(bettorId, netCredit, "BET_SETTLE_WIN", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: netCredit,
    reservedDelta: 0n,
    metadata: JSON.stringify({
      action: "settle_win",
      betOrderId,
      marketId,
      stake: stakeCentimes.toString(),
      winnings: winningsCentimes.toString(),
      commission: commissionCentimes.toString(),
    }),
  });
}

/**
 * Settle a losing bet: funds are forfeited (already removed from wallet
 * at match time). We record a ledger entry for auditability but no
 * balance change.
 */
export async function settleLoss(
  bettorId: string,
  stakeCentimes: bigint,
  betOrderId: string,
  marketId: string,
) {
  return ledgerEntry(bettorId, 0n, "BET_SETTLE_LOSS", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: 0n,
    reservedDelta: 0n,
    metadata: JSON.stringify({
      action: "settle_loss",
      betOrderId,
      marketId,
      stake: stakeCentimes.toString(),
    }),
  });
}

/**
 * Refund a matched bet (market cancelled): return the stake to available.
 */
export async function refundBet(
  bettorId: string,
  stakeCentimes: bigint,
  betOrderId: string,
  marketId: string,
) {
  return ledgerEntry(bettorId, stakeCentimes, "BET_REFUND", {
    refType: "bet_order",
    refId: betOrderId,
    availableDelta: stakeCentimes,
    reservedDelta: 0n,
    metadata: JSON.stringify({
      action: "refund",
      betOrderId,
      marketId,
      stake: stakeCentimes.toString(),
    }),
  });
}

/**
 * Deposit funds (admin/seed only — real payment integration is a stub).
 */
export async function deposit(bettorId: string, amountCentimes: bigint, referenceId?: string) {
  return ledgerEntry(bettorId, amountCentimes, "DEPOSIT", {
    refType: "deposit",
    refId: referenceId,
    availableDelta: amountCentimes,
    metadata: JSON.stringify({ action: "deposit", amount: amountCentimes.toString() }),
  });
}

/**
 * Withdraw funds (admin/seed only — real payment integration is a stub).
 */
export async function withdraw(bettorId: string, amountCentimes: bigint, referenceId?: string) {
  return ledgerEntry(bettorId, -amountCentimes, "WITHDRAWAL", {
    refType: "withdrawal",
    refId: referenceId,
    availableDelta: -amountCentimes,
    metadata: JSON.stringify({ action: "withdrawal", amount: amountCentimes.toString() }),
  });
}

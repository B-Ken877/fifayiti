// FIFAYITI PARIAJ — Wallet service (canonical ledger edition).
//
// ARCHITECTURE CHANGE: This module no longer writes to LedgerEntry.
// All financial movements go through the canonical FinancialTransaction +
// AccountEntry ledger via postFinancialTransaction(). Wallet remains as a
// read-only projection (synced from Account balances) for UI compatibility.
//
// Account mapping:
//   bettor_available → Account(type="bettor_available", bettorId)
//   bettor_reserved  → Account(type="bettor_reserved", bettorId)
//   platform_custody → Account(type="platform_custody")

import { db } from "@/lib/db";
import { postFinancialTransaction } from "@/lib/finance/ledger";
import {
  getOrCreateBettorAvailableAccount,
  getOrCreateBettorReservedAccount,
  getOrCreateCustodyAccount,
  getOrCreateBettingPoolAccount,
  getOrCreateRevenueAccount,
} from "@/lib/support/accounts";
import { createHash } from "crypto";

export interface WalletSnapshot {
  availableCentimes: bigint;
  reservedCentimes: bigint;
  totalCentimes: bigint;
}

/** Read a bettor's wallet (creates one if missing). */
export async function getWallet(bettorId: string) {
  const current = await db.wallet.findUnique({ where: { bettorId } });
  if (current) return current;
  const available = await getOrCreateBettorAvailableAccount(bettorId);
  const reserved = await getOrCreateBettorReservedAccount(bettorId);
  try {
    return await db.wallet.create({
      bettorId,
      availableCentimes: available.balanceCentimes,
      reservedCentimes: reserved.balanceCentimes,
    });
  } catch {
    return db.wallet.findUnique({ where: { bettorId } });
  }
}

/**
 * Sync the Wallet projection from the canonical Account balances.
 * Called after every financial operation that affects bettor accounts.
 */
async function syncWalletFromAccounts(bettorId: string, tx?: any) {
  const client = tx ?? db;
  const available = await getOrCreateBettorAvailableAccount(bettorId, client);
  const reserved = await getOrCreateBettorReservedAccount(bettorId, client);
  await client.wallet.upsert({
    where: { bettorId },
    update: {
      availableCentimes: available.balanceCentimes,
      reservedCentimes: reserved.balanceCentimes,
    },
    create: {
      bettorId,
      availableCentimes: available.balanceCentimes,
      reservedCentimes: reserved.balanceCentimes,
    },
  });
}

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Deposit funds — credits bettor_available + platform_custody.
 * Uses the canonical financial ledger.
 */
export async function deposit(bettorId: string, amountCentimes: bigint, referenceId?: string, tx?: any) {
  const bettorAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);
  const custodyAcct = await getOrCreateCustodyAccount(tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `deposit:${bettorId}:${referenceId ?? amountCentimes.toString()}`,
    requestFingerprint: fingerprint(["DEPOSIT", btorIdSafe(bettorId), amountCentimes.toString(), referenceId ?? ""]),
    type: "DEPOSIT",
    referenceType: "payment_intent",
    referenceId: referenceId ?? null,
    metadata: JSON.stringify({ action: "deposit", bettorId, amount: amountCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: custodyAcct.id, direction: "debit", amountCentimes },
      { accountId: bettorAcct.id, direction: "credit", amountCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Withdraw funds — debits bettor_available + credits platform_custody.
 */
export async function withdraw(bettorId: string, amountCentimes: bigint, referenceId?: string, tx?: any) {
  const bettorAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);
  const custodyAcct = await getOrCreateCustodyAccount(tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `withdraw:${bettorId}:${referenceId ?? amountCentimes.toString()}`,
    requestFingerprint: fingerprint(["WITHDRAWAL", btorIdSafe(bettorId), amountCentimes.toString(), referenceId ?? ""]),
    type: "WITHDRAWAL",
    referenceType: "withdrawal",
    referenceId: referenceId ?? null,
    metadata: JSON.stringify({ action: "withdrawal", bettorId, amount: amountCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: bettorAcct.id, direction: "debit", amountCentimes },
      { accountId: custodyAcct.id, direction: "credit", amountCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Reserve funds for a bet (available → reserved).
 * Throws if insufficient balance.
 */
export async function reserveForBet(bettorId: string, stakeCentimes: bigint, betOrderId: string, tx?: any) {
  const availableAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);
  const reservedAcct = await getOrCreateBettorReservedAccount(bettorId, tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `bet_reserve:${betOrderId}`,
    requestFingerprint: fingerprint(["BET_RESERVE", betOrderId, stakeCentimes.toString()]),
    type: "BET_RESERVE",
    referenceType: "bet_order",
    referenceId: betOrderId,
    metadata: JSON.stringify({ action: "reserve", betOrderId, bettorId, stake: stakeCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: availableAcct.id, direction: "debit", amountCentimes: stakeCentimes },
      { accountId: reservedAcct.id, direction: "credit", amountCentimes: stakeCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Release reserved funds back to available (bet cancelled while unmatched).
 */
export async function releaseFromBet(bettorId: string, stakeCentimes: bigint, betOrderId: string, tx?: any) {
  const availableAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);
  const reservedAcct = await getOrCreateBettorReservedAccount(bettorId, tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `bet_release:${betOrderId}`,
    requestFingerprint: fingerprint(["BET_RELEASE", betOrderId, stakeCentimes.toString()]),
    type: "BET_RELEASE",
    referenceType: "bet_order",
    referenceId: betOrderId,
    metadata: JSON.stringify({ action: "release", betOrderId, bettorId, stake: stakeCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: reservedAcct.id, direction: "debit", amountCentimes: stakeCentimes },
      { accountId: availableAcct.id, direction: "credit", amountCentimes: stakeCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Move a matched stake from the bettor's reserved liability into the pool
 * liability. Custody remains an asset and is not debited until a real payout.
 */
export async function matchBetFunds(bettorId: string, stakeCentimes: bigint, betOrderId: string, tx?: any) {
  const reservedAcct = await getOrCreateBettorReservedAccount(bettorId, tx);
  const bettingPoolAcct = await getOrCreateBettingPoolAccount(tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `bet_match:${betOrderId}`,
    requestFingerprint: fingerprint(["BET_MATCH", betOrderId, stakeCentimes.toString()]),
    type: "BET_MATCH",
    referenceType: "bet_order",
    referenceId: betOrderId,
    metadata: JSON.stringify({ action: "match", betOrderId, bettorId, stake: stakeCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: reservedAcct.id, direction: "debit", amountCentimes: stakeCentimes },
      { accountId: bettingPoolAcct.id, direction: "credit", amountCentimes: stakeCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Settle a winning bet: return the stake + winnings (minus commission).
 * The pot = winnerStake + loserStake. Winner gets pot - commission.
 * Commission goes to platform_revenue.
 *
 * Settlement amounts are DERIVED from actual matched orders — never trusted
 * from client input. The caller must pass values derived from the DB.
 */
export async function settleWin(
  bettorId: string,
  stakeCentimes: bigint,
  winningsCentimes: bigint,
  commissionCentimes: bigint,
  betOrderId: string,
  marketId: string,
  tx?: any,
) {
  // Net payout = stake + winnings - commission
  const netPayout = stakeCentimes + winningsCentimes - commissionCentimes;

  if (netPayout <= 0n) {
    throw new Error("Net payout must be positive");
  }

  const bettingPoolAcct = await getOrCreateBettingPoolAccount(tx);
  const bettorAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);

  const entries = [
    // Retire the matched pool liability as it is paid or earned.
    { accountId: bettingPoolAcct.id, direction: "debit", amountCentimes: netPayout },
    // Credit bettor available: winner receives net payout
    { accountId: bettorAcct.id, direction: "credit", amountCentimes: netPayout },
  ];

  // If there's commission, it goes to platform_revenue as a separate credit
  if (commissionCentimes > 0n) {
    const revenueAcct = await getOrCreateRevenueAccount(tx);
    // Total pool debit = winner payout + commission = both matched stakes.
    entries[0].amountCentimes = netPayout + commissionCentimes;
    // Credit revenue for the commission
    entries.push({ accountId: revenueAcct.id, direction: "credit", amountCentimes: commissionCentimes });
  }

  const result = await postFinancialTransaction({
    idempotencyKey: `bet_settle_win:${betOrderId}`,
    requestFingerprint: fingerprint(["BET_SETTLE_WIN", betOrderId, stakeCentimes.toString(), winningsCentimes.toString(), commissionCentimes.toString()]),
    type: "BET_SETTLEMENT",
    referenceType: "bet_order",
    referenceId: betOrderId,
    metadata: JSON.stringify({
      action: "settle_win",
      betOrderId,
      marketId,
      stake: stakeCentimes.toString(),
      winnings: winningsCentimes.toString(),
      commission: commissionCentimes.toString(),
      netPayout: netPayout.toString(),
    }),
    createdBy: "system",
    entries,
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

/**
 * Settle a losing bet: the stake is already in custody from BET_MATCH.
 * NO zero-value entries. The loss is recorded in BetOrder status only.
 */
export async function settleLoss(
  bettorId: string,
  stakeCentimes: bigint,
  betOrderId: string,
  marketId: string,
  tx?: any,
) {
  // No financial transaction needed — the stake was already moved to custody
  // during BET_MATCH. The loss is recorded in the BetOrder's settleOutcome.
  // We do NOT create a zero-value AccountEntry (per GLM-INSTRUCTIONS.md §2).
  await syncWalletFromAccounts(bettorId, tx);
  return { ok: true };
}

/**
 * Refund a matched bet (market cancelled): release the stake from the pool.
 */
export async function refundBet(
  bettorId: string,
  stakeCentimes: bigint,
  betOrderId: string,
  marketId: string,
  tx?: any,
) {
  const bettingPoolAcct = await getOrCreateBettingPoolAccount(tx);
  const bettorAcct = await getOrCreateBettorAvailableAccount(bettorId, tx);

  const result = await postFinancialTransaction({
    idempotencyKey: `bet_refund:${betOrderId}`,
    requestFingerprint: fingerprint(["BET_REFUND", betOrderId, stakeCentimes.toString()]),
    type: "BET_REFUND",
    referenceType: "bet_order",
    referenceId: betOrderId,
    metadata: JSON.stringify({ action: "refund", betOrderId, marketId, stake: stakeCentimes.toString() }),
    createdBy: "system",
    entries: [
      { accountId: bettingPoolAcct.id, direction: "debit", amountCentimes: stakeCentimes },
      { accountId: bettorAcct.id, direction: "credit", amountCentimes: stakeCentimes },
    ],
  }, tx);

  await syncWalletFromAccounts(bettorId, tx);
  return result;
}

// Legacy ledgerEntry — DEPRECATED. Do not call. Retained for reference only.
// All new code must use postFinancialTransaction via the functions above.
export async function ledgerEntry(): Promise<never> {
  throw new Error("ledgerEntry() is deprecated. Use the canonical ledger functions (deposit, withdraw, reserveForBet, etc.) instead.");
}

function btorIdSafe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

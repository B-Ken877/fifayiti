// FIFAYITI SIPÒ — Team Support Fund + Player Earnings account management.
//
// REUSES the existing Account/AccountEntry double-entry ledger. Team +
// player accounts are just Account rows with:
//   type = "team_support"    + teamId set
//   type = "player_earnings" + playerId set
//
// This module provides:
//   - getOrCreateTeamAccount(teamId) → Account (type="team_support")
//   - getOrCreatePlayerAccount(playerId) → Account (type="player_earnings")
//   - getTeamSupportBalance(teamId) → BigInt (the team's current fund)
//   - getPlayerEarnings(playerId) → BigInt (the player's total earnings)
//   - postDoubleEntry(tx, { debit, credit, amount, ledgerType, ref }) →
//     writes TWO AccountEntry rows (one debit + one credit) inside a
//     Prisma transaction, updating both account balances.

import { db } from "@/lib/db";
import { randomUUID } from "crypto";

/** Get or create the team's support fund account. */
export async function getOrCreateTeamAccount(teamId: string) {
  let account = await db.account.findFirst({
    where: { type: "team_support", teamId },
  });
  if (!account) {
    try {
      account = await db.account.create({
        data: { type: "team_support", teamId, currency: "HTG" },
      });
    } catch {
      // Race — re-read.
      account = await db.account.findFirst({
        where: { type: "team_support", teamId },
      });
    }
  }
  return account;
}

/** Get or create a player's earnings account. */
export async function getOrCreatePlayerAccount(playerId: string) {
  let account = await db.account.findFirst({
    where: { type: "player_earnings", playerId },
  });
  if (!account) {
    try {
      account = await db.account.create({
        data: { type: "player_earnings", playerId, currency: "HTG" },
      });
    } catch {
      account = await db.account.findFirst({
        where: { type: "player_earnings", playerId },
      });
    }
  }
  return account;
}

/** Get the team's current support fund balance (centimes). */
export async function getTeamSupportBalance(teamId: string): Promise<bigint> {
  const account = await getOrCreateTeamAccount(teamId);
  return account.balanceCentimes;
}

/** Get a player's total earnings balance (centimes). */
export async function getPlayerEarnings(playerId: string): Promise<bigint> {
  const account = await getOrCreatePlayerAccount(playerId);
  return account.balanceCentimes;
}

/**
 * Post a balanced double-entry transaction inside a Prisma transaction.
 *
 * Writes TWO AccountEntry rows (debit + credit) + updates both account
 * balances. The `transactionId` groups the two entries so reconciliation
 * can verify Σ debits == Σ credits per transaction.
 *
 * @param tx       the Prisma transaction client
 * @param debit    { accountId, amount } — the account to debit
 * @param credit   { accountId, amount } — the account to credit
 * @param ledgerType  e.g. "TEAM_DONATION", "TEAM_DISTRIBUTION"
 * @param refType  reference entity type (e.g. "team_donation")
 * @param refId    reference entity id
 * @returns the transactionId (groups the two entries)
 */
export async function postDoubleEntry(
  tx: any,
  opts: {
    debit: { accountId: string; amount: bigint };
    credit: { accountId: string; amount: bigint };
    ledgerType: string;
    refType?: string;
    refId?: string;
    metadata?: string;
  },
): Promise<string> {
  const transactionId = randomUUID();

  // Validate: debits == credits (balanced).
  if (opts.debit.amount !== opts.credit.amount) {
    throw new Error(
      `Unbalanced entry: debit ${opts.debit.amount} ≠ credit ${opts.credit.amount}`,
    );
  }
  if (opts.debit.amount <= 0n) {
    throw new Error("Amount must be positive.");
  }

  // Debit entry — decrease the source account.
  const debitAccount = await tx.account.findUnique({
    where: { id: opts.debit.accountId },
  });
  if (!debitAccount) throw new Error("Debit account not found.");
  if (debitAccount.balanceCentimes < opts.debit.amount) {
    throw new Error("Insufficient funds in debit account.");
  }
  await tx.account.update({
    where: { id: opts.debit.accountId },
    data: { balanceCentimes: debitAccount.balanceCentimes - opts.debit.amount },
  });
  await tx.accountEntry.create({
    data: {
      transactionId,
      accountId: opts.debit.accountId,
      direction: "debit",
      amountCentimes: opts.debit.amount,
      ledgerType: opts.ledgerType,
      referenceType: opts.refType ?? null,
      referenceId: opts.refId ?? null,
      metadata: opts.metadata ?? null,
    },
  });

  // Credit entry — increase the destination account.
  const creditAccount = await tx.account.findUnique({
    where: { id: opts.credit.accountId },
  });
  if (!creditAccount) throw new Error("Credit account not found.");
  await tx.account.update({
    where: { id: opts.credit.accountId },
    data: { balanceCentimes: creditAccount.balanceCentimes + opts.credit.amount },
  });
  await tx.accountEntry.create({
    data: {
      transactionId,
      accountId: opts.credit.accountId,
      direction: "credit",
      amountCentimes: opts.credit.amount,
      ledgerType: opts.ledgerType,
      referenceType: opts.refType ?? null,
      referenceId: opts.refId ?? null,
      metadata: opts.metadata ?? null,
    },
  });

  return transactionId;
}

/**
 * Get the platform custody account (FIFAYITI's master account).
 * All real money enters here before being credited to team/player/bettor accounts.
 */
export async function getOrCreateCustodyAccount() {
  let account = await db.account.findFirst({
    where: { type: "platform_custody", bettorId: null, teamId: null, playerId: null },
  });
  if (!account) {
    try {
      account = await db.account.create({
        data: { type: "platform_custody", currency: "HTG" },
      });
    } catch {
      account = await db.account.findFirst({
        where: { type: "platform_custody", bettorId: null, teamId: null, playerId: null },
      });
    }
  }
  return account;
}

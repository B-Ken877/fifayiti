// FIFAYITI SIPÒ + PARIAJ — Account management for the canonical financial ledger.
//
// REUSES the existing Account model with the new normalBalance field.
// Account types have explicit normal-balance semantics:
//   DEBIT-normal:  debit increases, credit decreases (custody, settlement)
//   CREDIT-normal: credit increases, debit decreases (bettor, team, player, revenue)

import { db } from "@/lib/db";

const NORMAL_BALANCE: Record<string, "DEBIT" | "CREDIT"> = {
  platform_custody: "DEBIT",
  platform_revenue: "CREDIT",
  platform_settlement: "DEBIT",
  bettor_available: "CREDIT",
  bettor_reserved: "CREDIT",
  team_support: "CREDIT",
  player_earnings: "CREDIT",
};

async function getOrCreateAccount(opts: {
  type: string;
  bettorId?: string;
  teamId?: string;
  playerId?: string;
  currency?: string;
}): Promise<any> {
  const where: any = { type: opts.type };
  if (opts.bettorId) where.bettorId = opts.bettorId;
  if (opts.teamId) where.teamId = opts.teamId;
  if (opts.playerId) where.playerId = opts.playerId;

  let account = await db.account.findFirst({ where });
  if (!account) {
    try {
      account = await db.account.create({
        data: {
          type: opts.type,
          normalBalance: NORMAL_BALANCE[opts.type] ?? "CREDIT",
          bettorId: opts.bettorId ?? null,
          teamId: opts.teamId ?? null,
          playerId: opts.playerId ?? null,
          currency: opts.currency ?? "HTG",
        },
      });
    } catch {
      account = await db.account.findFirst({ where });
    }
  }
  return account;
}

export async function getOrCreateTeamAccount(teamId: string) {
  return getOrCreateAccount({ type: "team_support", teamId });
}

export async function getOrCreatePlayerAccount(playerId: string) {
  return getOrCreateAccount({ type: "player_earnings", playerId });
}

export async function getOrCreateBettorAvailableAccount(bettorId: string) {
  return getOrCreateAccount({ type: "bettor_available", bettorId });
}

export async function getOrCreateBettorReservedAccount(bettorId: string) {
  return getOrCreateAccount({ type: "bettor_reserved", bettorId });
}

export async function getOrCreateCustodyAccount() {
  return getOrCreateAccount({ type: "platform_custody" });
}

export async function getOrCreateRevenueAccount() {
  return getOrCreateAccount({ type: "platform_revenue" });
}

export async function getTeamSupportBalance(teamId: string): Promise<bigint> {
  const account = await getOrCreateTeamAccount(teamId);
  return account.balanceCentimes;
}

export async function getPlayerEarnings(playerId: string): Promise<bigint> {
  const account = await getOrCreatePlayerAccount(playerId);
  return account.balanceCentimes;
}

/**
 * Post a balanced double-entry transaction.
 * Uses the canonical postFinancialTransaction from src/lib/finance/ledger.ts.
 * This is the ONLY way to move money in the system.
 */
export { postFinancialTransaction } from "../finance/ledger";

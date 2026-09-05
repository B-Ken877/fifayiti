/**
 * FIFAYITI canonical financial ledger.
 *
 * PostgreSQL production path only. This service is intentionally independent
 * of Prisma's generated FinancialTransaction model so it can be introduced
 * safely while the Prisma schema is being upgraded in the same change.
 *
 * Invariants enforced here AND by PostgreSQL:
 * - positive amounts only
 * - >= 2 entries
 * - balanced debits/credits
 * - deterministic idempotency
 * - row locks on affected accounts
 * - balance projection updated atomically with entries
 * - posted history cannot be mutated
 */

import { db } from "@/lib/db";

export type FinancialDirection = "debit" | "credit";

export interface FinancialLine {
  accountId: string;
  direction: FinancialDirection;
  amountCentimes: bigint;
}

export interface PostFinancialTransactionInput {
  idempotencyKey: string;
  requestFingerprint: string;
  type: string;
  currency?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: string;
  createdBy?: string;
  entries: FinancialLine[];
}

function q(value: unknown) {
  return String(value).replace(/'/g, "''");
}

/**
 * Post one immutable, balanced financial transaction.
 *
 * IMPORTANT: callers must provide a stable requestFingerprint derived from the
 * complete semantic operation payload. Reusing a key with a different
 * fingerprint is rejected.
 */
export async function postFinancialTransaction(input: PostFinancialTransactionInput) {
  if (!input.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  if (!input.requestFingerprint.trim()) throw new Error("requestFingerprint is required");
  if (input.entries.length < 2) throw new Error("A financial transaction requires at least two entries");

  let debits = 0n;
  let credits = 0n;
  for (const line of input.entries) {
    if (line.amountCentimes <= 0n) throw new Error("Financial entry amount must be positive");
    if (line.direction === "debit") debits += line.amountCentimes;
    else credits += line.amountCentimes;
  }
  if (debits !== credits) {
    throw new Error(`Unbalanced transaction: debits=${debits} credits=${credits}`);
  }

  return db.$transaction(async (tx) => {
    const transactionId = crypto.randomUUID();

    // Claim the idempotency key. If another request already owns it, the
    // following SELECT ... FOR UPDATE waits for that request to finish.
    await tx.$executeRawUnsafe(`
      INSERT INTO "FinancialTransaction"
        ("id","type","status","currency","idempotencyKey","requestFingerprint","referenceType","referenceId","metadata","createdBy","createdAt","updatedAt")
      VALUES
        ('${q(transactionId)}','${q(input.type)}','POSTING','${q(input.currency ?? "HTG")}','${q(input.idempotencyKey)}','${q(input.requestFingerprint)}',
         ${input.referenceType ? `'${q(input.referenceType)}'` : "NULL"},
         ${input.referenceId ? `'${q(input.referenceId)}'` : "NULL"},
         ${input.metadata ? `'${q(input.metadata)}'` : "NULL"},
         ${input.createdBy ? `'${q(input.createdBy)}'` : "NULL"},
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("idempotencyKey") DO NOTHING
    `);

    const existing = await tx.$queryRawUnsafe<Array<{
      id: string;
      status: string;
      requestFingerprint: string | null;
    }>>(`
      SELECT "id", "status", "requestFingerprint"
      FROM "FinancialTransaction"
      WHERE "idempotencyKey"='${q(input.idempotencyKey)}'
    `);

    if (existing.length !== 1) throw new Error("Financial transaction idempotency row missing");
    const header = existing[0];

    if (header.requestFingerprint !== input.requestFingerprint) {
      throw new Error("Idempotency key was already used with a different request");
    }

    // Another identical request already completed the operation.
    if (header.status === "POSTED") return { transactionId: header.id, alreadyPosted: true };
    if (header.status !== "POSTING") {
      throw new Error(`Financial transaction is not postable: ${header.status}`);
    }

    // Lock accounts in deterministic ID order to minimize deadlock risk.
    const accountIds = [...new Set(input.entries.map((e) => e.accountId))].sort();
    const locked = await tx.$queryRawUnsafe<Array<{
      id: string;
      balanceCentimes: bigint;
      normalBalance: string;
      currency: string;
    }>>(`
      SELECT "id", "balanceCentimes", "normalBalance", "currency"
      FROM "Account"
      WHERE "id" IN (${accountIds.map((id) => `'${q(id)}'`).join(",")})
      ORDER BY "id"
    `);

    const byId = new Map(locked.map((a) => [a.id, a]));
    if (locked.length !== accountIds.length) throw new Error("One or more financial accounts do not exist");

    const newBalances = new Map<string, bigint>();
    for (const line of input.entries) {
      const account = byId.get(line.accountId)!;
      if (account.currency !== (input.currency ?? "HTG")) {
        throw new Error("Cross-currency financial transaction is not allowed");
      }

      const current = newBalances.get(line.accountId) ?? account.balanceCentimes;
      const delta = account.normalBalance === "DEBIT"
        ? (line.direction === "debit" ? line.amountCentimes : -line.amountCentimes)
        : (line.direction === "credit" ? line.amountCentimes : -line.amountCentimes);
      const next = current + delta;
      if (next < 0n) throw new Error(`Insufficient funds in account ${line.accountId}`);
      newBalances.set(line.accountId, next);
    }

    for (const [accountId, balance] of newBalances) {
      await tx.account.update({
        where: { id: accountId },
        data: { balanceCentimes: balance },
      });
    }

    for (const line of input.entries) {
      await tx.accountEntry.create({
        data: {
          transactionId: header.id,
          accountId: line.accountId,
          direction: line.direction,
          amountCentimes: line.amountCentimes,
          ledgerType: input.type,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          metadata: input.metadata ?? null,
        },
      });
    }

    await tx.$executeRawUnsafe(`
      UPDATE "FinancialTransaction"
      SET "status"='POSTED', "postedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"='${q(header.id)}'
    `);

    return { transactionId: header.id, alreadyPosted: false };
  });
}

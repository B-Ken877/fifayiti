// FIFAYITI SIPÒ — Donation service (canonical ledger edition).
//
// Fans initiate a donation → PaymentIntent is created (PENDING) →
// provider verifies via webhook → TeamDonation is confirmed + the
// team's support fund is credited via the canonical FinancialTransaction.
//
// 0% FIFAYITI commission — 100% goes to the team.
// NO money is credited until the webhook verifies.

import { db } from "@/lib/db";
import { getProvider, providerStatus } from "@/lib/payment";
import { createHash } from "crypto";
import { postFinancialTransaction } from "@/lib/finance/ledger";
import {
  getOrCreateTeamAccount,
  getOrCreateCustodyAccount,
} from "@/lib/support/accounts";

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function initiateDonation(opts: {
  teamId: string;
  amountCentimes: bigint;
  provider: "moncash" | "natcash" | "demo";
  donorBettorId?: string;
  donorName?: string;
  anonymous?: boolean;
  message?: string;
  returnUrl: string;
}): Promise<{
  ok: boolean;
  donationId?: string;
  intentId?: string;
  redirectUrl?: string;
  error?: string;
}> {
  if (!["moncash", "natcash", "demo"].includes(opts.provider)) {
    return { ok: false, error: "Pwovèdè peyman sa a pa sipòte." };
  }
  if (opts.provider === "demo" && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Demo pa disponib nan pwodiksyon." };
  }
  const providers = providerStatus();
  if (opts.provider !== "demo" && !providers[opts.provider]) {
    return { ok: false, error: `${opts.provider} pa disponib pou peman kounye a.` };
  }
  const team = await db.team.findUnique({ where: { id: opts.teamId } });
  if (!team) return { ok: false, error: "Ekip sa a pa egziste." };

  if (opts.amountCentimes <= 0n || opts.amountCentimes > 100_000_000n) {
    return { ok: false, error: "Montan pa valid." };
  }

  const isAnonymous = opts.anonymous ?? true;
  const { intent, donation } = await db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.create({
      data: {
        bettorId: opts.donorBettorId ?? null,
        provider: opts.provider,
        amountCentimes: opts.amountCentimes,
        returnUrl: opts.returnUrl,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const donation = await tx.teamDonation.create({
      data: {
        teamId: opts.teamId,
        paymentIntentId: intent.id,
        amountCentimes: opts.amountCentimes,
        donorBettorId: opts.donorBettorId ?? null,
        donorName: isAnonymous ? null : opts.donorName ?? null,
        anonymous: isAnonymous,
        message: opts.message ?? null,
      },
    });
    return { intent, donation };
  });

  const provider = getProvider(opts.provider);
  let depositIntent;
  try {
    depositIntent = await provider.createDepositIntent({
      intentId: intent.id,
      bettorId: opts.donorBettorId ?? "anonymous",
      amountCentimes: opts.amountCentimes,
      returnUrl: opts.returnUrl,
    });
    if (
      depositIntent.provider !== opts.provider || depositIntent.intentId !== intent.id ||
      depositIntent.amountCentimes !== opts.amountCentimes
    ) {
      throw new Error("Payment provider returned an invalid intent");
    }
    if (depositIntent.redirectUrl) {
      const checkout = new URL(depositIntent.redirectUrl);
      if (checkout.protocol !== "https:" || checkout.username || checkout.password) {
        throw new Error("Payment provider returned an unsafe checkout URL");
      }
    }
  } catch (e: any) {
    await db.$transaction(async (tx) => {
      await tx.paymentIntent.updateMany({ where: { id: intent.id, status: "pending" }, data: { status: "failed" } });
      await tx.teamDonation.updateMany({ where: { id: donation.id, status: "PENDING" }, data: { status: "FAILED" } });
    });
    return { ok: false, error: e?.message ?? "Pwovèdè peyman pa disponib." };
  }

  await db.paymentIntent.update({ where: { id: intent.id }, data: { redirectUrl: depositIntent.redirectUrl ?? null } });

  if (opts.provider === "demo" && process.env.NODE_ENV !== "production") {
    const confirmation = await confirmDonation(intent.id, `demo-${intent.id}`, {
      provider: "demo",
      amountCentimes: opts.amountCentimes,
    });
    if (!confirmation.ok) {
      return { ok: false, error: "Nou pa t kapab konfime don an." };
    }
    return { ok: true, donationId: donation.id, intentId: intent.id };
  }

  return {
    ok: true,
    donationId: donation.id,
    intentId: intent.id,
    redirectUrl: depositIntent.redirectUrl,
  };
}

/**
 * Confirm a donation after the payment provider's webhook verifies.
 * Uses the canonical postFinancialTransaction to create a balanced double-entry.
 *
 * IDEMPOTENT: if the donation is already CONFIRMED, returns without re-crediting.
 */
export async function confirmDonation(
  intentId: string,
  providerPaymentId: string,
  verified?: { provider: string; amountCentimes: bigint; rawPayload?: string },
): Promise<{ ok: boolean; reason?: string }> {
  return db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) return { ok: false, reason: "intent not found" };
    if (verified && (intent.provider !== verified.provider || intent.amountCentimes !== verified.amountCentimes)) {
      return { ok: false, reason: "payment does not match intent" };
    }

    const donation = await tx.teamDonation.findUnique({ where: { paymentIntentId: intentId } });
    if (!donation) return { ok: false, reason: "donation not found" };
    if (intent.status === "paid" && intent.providerPaymentId !== providerPaymentId) {
      return { ok: false, reason: "intent already paid by a different provider payment" };
    }
    if (donation.status === "CONFIRMED" && donation.ledgerTransactionId) return { ok: true };
    if (donation.status !== "PENDING" || (intent.status !== "pending" && intent.status !== "paid")) {
      return { ok: false, reason: "donation is not payable" };
    }

    const now = new Date();
    if (intent.status === "pending") {
      const claimed = await tx.paymentIntent.updateMany({
        where: { id: intent.id, status: "pending" },
        data: { status: "paid", providerPaymentId, confirmedAt: now, rawWebhookPayload: verified?.rawPayload },
      });
      if (claimed.count !== 1) throw new Error("payment intent was confirmed concurrently");
    }

    const custodyAcct = await getOrCreateCustodyAccount(tx);
    const teamAcct = await getOrCreateTeamAccount(donation.teamId, tx);

    const result = await postFinancialTransaction({
      idempotencyKey: `team_donation:${donation.id}`,
      requestFingerprint: fingerprint(["TEAM_DONATION", donation.id, donation.amountCentimes.toString(), donation.teamId]),
      type: "TEAM_DONATION",
      referenceType: "team_donation",
      referenceId: donation.id,
      metadata: JSON.stringify({ teamId: donation.teamId, amount: donation.amountCentimes.toString() }),
      createdBy: "system",
      entries: [
        { accountId: custodyAcct.id, direction: "debit", amountCentimes: donation.amountCentimes },
        { accountId: teamAcct.id, direction: "credit", amountCentimes: donation.amountCentimes },
      ],
    }, tx);

    await tx.teamDonation.updateMany({
      where: { id: donation.id, status: "PENDING" },
      data: { status: "CONFIRMED", confirmedAt: now, ledgerTransactionId: result.transactionId },
    });

    return { ok: true };
  });
}

export async function getTeamSupportStats(teamId: string) {
  const where = { teamId, status: "CONFIRMED" as const };
  const [totals, donations] = await Promise.all([
    db.teamDonation.aggregate({ where, _sum: { amountCentimes: true }, _count: { _all: true } }),
    db.teamDonation.findMany({
      where,
      select: { amountCentimes: true, anonymous: true, donorName: true, createdAt: true, message: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalCentimes: (totals._sum.amountCentimes ?? 0n).toString(),
    supporterCount: totals._count._all,
    recentDonations: donations.map((d) => ({
      amount: d.amountCentimes.toString(),
      anonymous: d.anonymous,
      donorName: d.anonymous ? null : d.donorName,
      message: d.message,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

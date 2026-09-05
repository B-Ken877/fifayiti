// FIFAYITI SIPÒ — Donation service (canonical ledger edition).
//
// Fans initiate a donation → PaymentIntent is created (PENDING) →
// provider verifies via webhook → TeamDonation is confirmed + the
// team's support fund is credited via the canonical FinancialTransaction.
//
// 0% FIFAYITI commission — 100% goes to the team.
// NO money is credited until the webhook verifies.

import { db } from "@/lib/db";
import { getProvider } from "@/lib/payment";
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
  const team = await db.team.findUnique({ where: { id: opts.teamId } });
  if (!team) return { ok: false, error: "Ekip sa a pa egziste." };

  if (opts.amountCentimes <= 0n || opts.amountCentimes > 100_000_000n) {
    return { ok: false, error: "Montan pa valid." };
  }

  const intent = await db.paymentIntent.create({
    data: {
      bettorId: opts.donorBettorId ?? null,
      provider: opts.provider,
      amountCentimes: opts.amountCentimes,
      returnUrl: opts.returnUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const donation = await db.teamDonation.create({
    data: {
      teamId: opts.teamId,
      paymentIntentId: intent.id,
      amountCentimes: opts.amountCentimes,
      donorBettorId: opts.donorBettorId ?? null,
      donorName: opts.donorName ?? null,
      anonymous: opts.anonymous ?? true,
      message: opts.message ?? null,
    },
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
  } catch (e: any) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "failed" },
    });
    await db.teamDonation.update({
      where: { id: donation.id },
      data: { status: "FAILED" },
    });
    return { ok: false, error: e?.message ?? "Pwovèdè peyman pa disponib." };
  }

  if (opts.provider === "demo" && process.env.NODE_ENV !== "production") {
    try {
      await fetch(`${opts.returnUrl.includes("vercel") ? "" : "http://localhost:3000"}/api/support/webhooks/demo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentId: intent.id }),
      }).catch(() => {});
    } catch {}
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
): Promise<{ ok: boolean; reason?: string }> {
  return db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) return { ok: false, reason: "intent not found" };
    if (intent.status === "paid") return { ok: true };

    const donation = await tx.teamDonation.findUnique({ where: { paymentIntentId: intentId } });
    if (!donation) return { ok: false, reason: "donation not found" };
    if (donation.status === "CONFIRMED") return { ok: true };

    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "paid", providerPaymentId, confirmedAt: new Date() },
    });

    // Use the canonical ledger service (outside the Prisma tx — it manages its own tx).
    // We mark the donation as confirmed first; the financial transaction is posted next.
    await tx.teamDonation.update({
      where: { id: donation.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    // Post the financial transaction using the canonical ledger.
    // This happens OUTSIDE the Prisma tx — the idempotency key prevents duplicates.
    const custodyAcct = await getOrCreateCustodyAccount();
    const teamAcct = await getOrCreateTeamAccount(donation.teamId);

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
    });

    await tx.teamDonation.update({
      where: { id: donation.id },
      data: { ledgerTransactionId: result.transactionId },
    });

    return { ok: true };
  });
}

export async function getTeamSupportStats(teamId: string) {
  const donations = await db.teamDonation.findMany({
    where: { teamId, status: "CONFIRMED" },
    select: { amountCentimes: true, anonymous: true, donorName: true, createdAt: true, message: true },
    orderBy: { createdAt: "desc" },
  });

  const total = donations.reduce((sum, d) => sum + d.amountCentimes, 0n);
  const supporterCount = donations.length;

  return {
    totalCentimes: total.toString(),
    supporterCount,
    recentDonations: donations.slice(0, 10).map((d) => ({
      amount: d.amountCentimes.toString(),
      anonymous: d.anonymous,
      donorName: d.anonymous ? null : d.donorName,
      message: d.message,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

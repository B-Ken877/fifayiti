// FIFAYITI SIPÒ — Donation service.
//
// Fans initiate a donation → PaymentIntent is created (PENDING) →
// provider verifies via webhook → TeamDonation is confirmed + the
// team's support fund is credited via a balanced AccountEntry.
//
// NO money is credited until the webhook verifies. The client never
// directly creates a successful donation.
//
// 0% FIFAYITI commission — 100% goes to the team.

import { db } from "@/lib/db";
import { getProvider } from "@/lib/payment";
import { randomUUID } from "crypto";
import {
  getOrCreateTeamAccount,
  getOrCreateCustodyAccount,
  postDoubleEntry,
} from "./accounts";

/**
 * Initiate a team support donation.
 *
 * Creates a PaymentIntent (pending) + a TeamDonation record (pending).
 * No money is moved. The webhook will confirm + credit the team fund.
 *
 * @returns the donation id + payment intent id (+ redirect URL if real provider)
 */
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
  // Validate the team exists.
  const team = await db.team.findUnique({ where: { id: opts.teamId } });
  if (!team) return { ok: false, error: "Ekip sa a pa egziste." };

  if (opts.amountCentimes <= 0n || opts.amountCentimes > 100_000_000n) {
    return { ok: false, error: "Montan pa valid." };
  }

  // Create the PaymentIntent (same model as bettor deposits).
  const intent = await db.paymentIntent.create({
    data: {
      bettorId: opts.donorBettorId ?? null,
      provider: opts.provider,
      amountCentimes: opts.amountCentimes,
      returnUrl: opts.returnUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  // Create the TeamDonation record (pending).
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

  // Ask the provider for a deposit intent (redirect URL).
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

  // Demo flow (dev only): simulate immediate webhook.
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
 *
 * Atomically:
 *   1. Marks the PaymentIntent as "paid"
 *   2. Marks the TeamDonation as "CONFIRMED"
 *   3. Posts a balanced double-entry: debit platform_custody, credit team_support
 *
 * IDEMPOTENT: if the donation is already CONFIRMED, returns without
 * re-crediting.
 */
export async function confirmDonation(
  intentId: string,
  providerPaymentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  return db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent) return { ok: false, reason: "intent not found" };
    if (intent.status === "paid") return { ok: true }; // idempotent

    const donation = await tx.teamDonation.findUnique({
      where: { paymentIntentId: intentId },
    });
    if (!donation) return { ok: false, reason: "donation not found" };
    if (donation.status === "CONFIRMED") return { ok: true }; // idempotent

    // Mark the intent as paid.
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "paid",
        providerPaymentId,
        confirmedAt: new Date(),
      },
    });

    // Get or create custody + team accounts INSIDE the transaction.
    let custodyAccount = await tx.account.findFirst({
      where: { type: "platform_custody", bettorId: null, teamId: null, playerId: null },
    });
    if (!custodyAccount) {
      custodyAccount = await tx.account.create({
        data: { type: "platform_custody", currency: "HTG" },
      });
    }

    let teamAccount = await tx.account.findFirst({
      where: { type: "team_support", teamId: donation.teamId },
    });
    if (!teamAccount) {
      teamAccount = await tx.account.create({
        data: { type: "team_support", teamId: donation.teamId, currency: "HTG" },
      });
    }

    // ── P0 #1: TRUE DOUBLE-ENTRY ──────────────────────────────────────
    // The real-world payment is external, but internally FIFAYITI must
    // represent custody + ownership. Two AccountEntry rows, ONE transactionId.
    //
    //   DEBIT  platform_custody   (custody receives the external funds)
    //   CREDIT team_support       (ownership transferred to the team fund)
    //
    // Both accounts increase. Σ debits == Σ credits.
    const txnId = randomUUID();
    const amount = donation.amountCentimes;

    // Debit platform_custody (increase — custody holds the external inflow).
    await tx.account.update({
      where: { id: custodyAccount.id },
      data: { balanceCentimes: custodyAccount.balanceCentimes + amount },
    });
    await tx.accountEntry.create({
      data: {
        transactionId: txnId,
        accountId: custodyAccount.id,
        direction: "debit",
        amountCentimes: amount,
        ledgerType: "TEAM_DONATION",
        referenceType: "team_donation",
        referenceId: donation.id,
        metadata: JSON.stringify({ teamId: donation.teamId, amount: amount.toString() }),
      },
    });

    // Credit team_support (increase — team owns the funds).
    await tx.account.update({
      where: { id: teamAccount.id },
      data: { balanceCentimes: teamAccount.balanceCentimes + amount },
    });
    await tx.accountEntry.create({
      data: {
        transactionId: txnId,
        accountId: teamAccount.id,
        direction: "credit",
        amountCentimes: amount,
        ledgerType: "TEAM_DONATION",
        referenceType: "team_donation",
        referenceId: donation.id,
        metadata: JSON.stringify({ teamId: donation.teamId, amount: amount.toString() }),
      },
    });

    // Mark the donation as confirmed.
    await tx.teamDonation.update({
      where: { id: donation.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        ledgerTransactionId: txnId,
      },
    });

    return { ok: true };
  });
}

/**
 * Get public support stats for a team.
 * Returns total support, supporter count, and recent donations (anonymous).
 */
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

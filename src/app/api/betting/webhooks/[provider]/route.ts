// POST /api/betting/webhooks/[provider]
//
// The payment provider calls this after a payment is confirmed. The
// handler verifies the webhook signature (provider-specific), finds the
// matching PaymentIntent, and credits the bettor's wallet — atomically.
//
// IDEMPOTENCY:
//   The PaymentIntent has @@unique([provider, providerPaymentId]). If the
//   provider retries the webhook (common), the second call sees the
//   intent is already "paid" and returns 200 without re-crediting.
//
// SECURITY:
//   The signature is verified server-side via the provider's
//   `verifyWebhook` implementation. An unsigned/forged webhook is rejected
//   with 401. The bettor's wallet is NEVER credited without a verified
//   provider confirmation.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payment";
import { deposit } from "@/lib/betting/wallet";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await params;
  if (providerName !== "moncash" && providerName !== "natcash" && providerName !== "demo") {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  // Read the raw body (signature verification needs the exact bytes).
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  // Verify the webhook (provider-specific signature check).
  const provider = getProvider(providerName as any);
  let verified;
  try {
    verified = await provider.verifyWebhook(headers, rawBody);
  } catch (e: any) {
    console.warn(`[webhook/${providerName}] verification failed:`, e?.message);
    return NextResponse.json({ error: "webhook verification failed" }, { status: 401 });
  }

  if (verified.status !== "paid") {
    // Payment failed — mark the intent as failed but no wallet change.
    await db.paymentIntent.updateMany({
      where: { id: verified.intentId, status: "pending" },
      data: { status: "failed", providerPaymentId: verified.providerPaymentId, rawWebhookPayload: rawBody },
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // ── IDEMPOTENT CREDIT ───────────────────────────────────────────────
  // Atomically: mark the intent as paid AND credit the wallet. If the
  // intent is already "paid" (webhook retry), do nothing — return 200.
  try {
    await db.$transaction(async (tx) => {
      // Lock the intent row by re-reading it inside the transaction.
      const intent = await tx.paymentIntent.findUnique({
        where: { id: verified.intentId },
      });
      if (!intent) {
        throw new Error("intent not found");
      }
      if (intent.status === "paid") {
        // Already processed (webhook retry). Idempotent return.
        return;
      }
      if (intent.status === "failed") {
        throw new Error("intent already failed");
      }

      // Mark as paid + record the provider's payment id.
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "paid",
          providerPaymentId: verified.providerPaymentId,
          confirmedAt: new Date(),
          rawWebhookPayload: rawBody,
        },
      });

      // Credit the bettor's wallet via the double-entry ledger.
      // The `deposit` helper writes a LedgerEntry + updates the Wallet
      // inside this same transaction (atomic).
      await deposit(intent.bettorId, intent.amountCentimes, intent.id);
    });

    await logBettingAction({
      actorType: "system",
      action: "wallet.deposit.confirmed",
      targetType: "payment_intent",
      targetId: verified.intentId,
      afterState: { provider: providerName, amount: verified.amountCentimes.toString() },
    });

    return NextResponse.json({ ok: true, status: "paid" });
  } catch (e: any) {
    // If the unique constraint on (provider, providerPaymentId) fires,
    // this is a duplicate webhook — idempotent return.
    if (String(e?.code ?? "").includes("P2002")) {
      return NextResponse.json({ ok: true, status: "duplicate" });
    }
    console.error(`[webhook/${providerName}] credit failed:`, e?.message);
    return NextResponse.json({ error: "credit failed" }, { status: 500 });
  }
}

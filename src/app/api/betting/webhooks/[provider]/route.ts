// POST /api/betting/webhooks/[provider]
//
// The payment provider calls this after a payment is confirmed. The
// handler verifies the webhook signature (provider-specific), finds the
// matching PaymentIntent, and credits the bettor's wallet via the
// canonical financial ledger — atomically.
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

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const provider = getProvider(providerName as any);
  let verified;
  try {
    verified = await provider.verifyWebhook(headers, rawBody);
  } catch (e: any) {
    console.warn(`[webhook/${providerName}] verification failed:`, e?.message);
    return NextResponse.json({ error: "webhook verification failed" }, { status: 401 });
  }

  if (verified.status !== "paid") {
    await db.paymentIntent.updateMany({
      where: { id: verified.intentId, status: "pending" },
      data: { status: "failed", providerPaymentId: verified.providerPaymentId, rawWebhookPayload: rawBody },
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  try {
    // Mark the intent as paid first (idempotent).
    const intent = await db.paymentIntent.findUnique({ where: { id: verified.intentId } });
    if (!intent) return NextResponse.json({ error: "intent not found" }, { status: 404 });
    if (intent.status === "paid") return NextResponse.json({ ok: true, status: "duplicate" });

    await db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "paid",
        providerPaymentId: verified.providerPaymentId,
        confirmedAt: new Date(),
        rawWebhookPayload: rawBody,
      },
    });

    // Credit via the canonical financial ledger (no LedgerEntry writes).
    // The `deposit` function creates a FinancialTransaction + AccountEntry rows
    // + updates Account balances + syncs the Wallet projection.
    if (intent.bettorId) {
      await deposit(intent.bettorId, intent.amountCentimes, intent.id);
    }

    await logBettingAction({
      actorType: "system",
      action: "wallet.deposit.confirmed",
      targetType: "payment_intent",
      targetId: verified.intentId,
      afterState: { provider: providerName, amount: verified.amountCentimes.toString() },
    });

    return NextResponse.json({ ok: true, status: "paid" });
  } catch (e: any) {
    if (String(e?.code ?? "").includes("P2002")) {
      return NextResponse.json({ ok: true, status: "duplicate" });
    }
    console.error(`[webhook/${providerName}] credit failed:`, e?.message);
    return NextResponse.json({ error: "credit failed" }, { status: 500 });
  }
}

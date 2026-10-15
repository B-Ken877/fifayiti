// Verified payment callbacks for bettor deposits and team donations.
// The intent, canonical ledger transaction, and wallet projection are updated
// in one database transaction so a retry can safely recover from failures.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider, providerStatus } from "@/lib/payment";
import { deposit } from "@/lib/betting/wallet";
import { confirmDonation } from "@/lib/support/donation-service";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await params;
  if (providerName !== "moncash" && providerName !== "natcash" && providerName !== "demo") {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  // The demo verifier intentionally accepts unsigned payloads, so never
  // expose it in production (including for bettors who guess an intent ID).
  if (providerName === "demo" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "demo webhook is disabled in production" }, { status: 404 });
  }

  const availability = providerStatus();
  if (!availability[providerName]) {
    return NextResponse.json({ error: "payment provider is unavailable" }, { status: 503 });
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > 64 * 1024) {
    return NextResponse.json({ error: "webhook payload too large" }, { status: 413 });
  }
  const reader = req.body?.getReader();
  let rawBody = "";
  if (reader) {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 64 * 1024) {
        await reader.cancel();
        return NextResponse.json({ error: "webhook payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    rawBody = new TextDecoder().decode(bytes);
  }
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => { headers[key] = value; });

  let verified;
  try {
    verified = await getProvider(providerName).verifyWebhook(headers, rawBody);
  } catch (error: any) {
    console.warn(`[webhook/${providerName}] verification failed:`, error?.message);
    return NextResponse.json({ error: "webhook verification failed" }, { status: 401 });
  }

  if (
    verified.provider !== providerName || typeof verified.intentId !== "string" || !verified.intentId ||
    typeof verified.providerPaymentId !== "string" || !verified.providerPaymentId ||
    typeof verified.amountCentimes !== "bigint" || verified.amountCentimes <= 0n ||
    (verified.status !== "paid" && verified.status !== "failed")
  ) {
    return NextResponse.json({ error: "invalid verified payment" }, { status: 400 });
  }

  try {
    const intent = await db.paymentIntent.findUnique({ where: { id: verified.intentId } });
    if (!intent) return NextResponse.json({ error: "intent not found" }, { status: 404 });
    if (intent.provider !== providerName || intent.currency !== "HTG" || intent.amountCentimes !== verified.amountCentimes) {
      return NextResponse.json({ error: "payment does not match intent" }, { status: 409 });
    }

    if (intent.status === "paid") {
      if (intent.providerPaymentId !== verified.providerPaymentId) {
        return NextResponse.json({ error: "intent already paid with another provider payment" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, status: "duplicate" });
    }
    if (intent.status !== "pending") {
      return NextResponse.json({ error: "intent is no longer payable" }, { status: 409 });
    }

    if (verified.status === "failed") {
      await db.$transaction(async (tx) => {
        const claimed = await tx.paymentIntent.updateMany({
          where: { id: intent.id, provider: providerName, status: "pending" },
          data: { status: "failed", providerPaymentId: verified.providerPaymentId, rawWebhookPayload: rawBody },
        });
        if (claimed.count !== 1) throw new Error("payment intent changed concurrently");
        await tx.teamDonation.updateMany({
          where: { paymentIntentId: intent.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
      });
      return NextResponse.json({ ok: true, status: "failed" });
    }

    const donation = await db.teamDonation.findUnique({ where: { paymentIntentId: intent.id } });
    if (donation) {
      const result = await confirmDonation(intent.id, verified.providerPaymentId, {
        provider: providerName,
        amountCentimes: verified.amountCentimes,
        rawPayload: rawBody,
      });
      if (!result.ok) return NextResponse.json({ error: result.reason ?? "donation confirmation failed" }, { status: 409 });
      return NextResponse.json({ ok: true, status: "paid", type: "donation" });
    }

    if (!intent.bettorId || (verified.bettorId && verified.bettorId !== intent.bettorId)) {
      return NextResponse.json({ error: "payment does not belong to a bettor" }, { status: 409 });
    }

    await db.$transaction(async (tx) => {
      const claimed = await tx.paymentIntent.updateMany({
        where: { id: intent.id, provider: providerName, status: "pending", bettorId: intent.bettorId },
        data: {
          status: "paid",
          providerPaymentId: verified.providerPaymentId,
          confirmedAt: verified.paidAt instanceof Date && !Number.isNaN(verified.paidAt.valueOf()) ? verified.paidAt : new Date(),
          rawWebhookPayload: rawBody,
        },
      });
      if (claimed.count !== 1) throw new Error("payment intent changed concurrently");
      await deposit(intent.bettorId!, intent.amountCentimes, intent.id, tx);
    });

    await logBettingAction({
      actorType: "system",
      action: "wallet.deposit.confirmed",
      targetType: "payment_intent",
      targetId: verified.intentId,
      bettorId: intent.bettorId,
      afterState: { provider: providerName, amount: verified.amountCentimes.toString() },
    });

    return NextResponse.json({ ok: true, status: "paid" });
  } catch (error: any) {
    if (String(error?.code ?? "").includes("P2002")) {
      const current = await db.paymentIntent.findUnique({ where: { id: verified.intentId } });
      if (current?.status === "paid" && current.providerPaymentId === verified.providerPaymentId) {
        return NextResponse.json({ ok: true, status: "duplicate" });
      }
      return NextResponse.json({ error: "provider payment was already used" }, { status: 409 });
    }
    console.error(`[webhook/${providerName}] confirmation failed:`, error?.message);
    return NextResponse.json({ error: "payment confirmation failed" }, { status: 500 });
  }
}

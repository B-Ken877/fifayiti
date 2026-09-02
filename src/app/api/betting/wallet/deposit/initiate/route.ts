// POST /api/betting/wallet/deposit/initiate
//
// Initiates a deposit through a payment provider. The client calls this
// with the desired amount + provider; the server creates a PaymentIntent
// (status=pending) and returns a redirect URL the client opens to
// complete payment on the provider's domain.
//
// NO money is created at this step. Money is created ONLY when the
// provider's webhook verifies a real payment (see
// /api/betting/webhooks/[provider]/route.ts).
//
// Demo deposits (provider="demo") are DISABLED in production — only
// available in dev/test. This means there is NO WAY for a client to give
// themselves money in production; every deposit must come through a
// verified webhook from a real payment provider.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { getProvider, providerStatus } from "@/lib/payment";
import { db } from "@/lib/db";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  // Rate limit: 3 deposit initiations per hour per bettor.
  const rl = rateLimit("deposit_initiate", bettor.id, LIMITS.DEPOSIT.limit, LIMITS.DEPOSIT.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann depo. Eseye ankò pita." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { amountCentimes: amtStr, provider: providerName, returnUrl } = body;
    const amountCentimes = BigInt(amtStr ?? 0);

    if (amountCentimes <= 0n || amountCentimes > 100_000_000n) {
      return NextResponse.json({ error: "Montan pa valid." }, { status: 400 });
    }

    // Reject demo deposits in production (no fake money in prod).
    const status = providerStatus();
    if (providerName === "demo" && !status.demo) {
      return NextResponse.json(
        { error: "Demo depo pa disponib nan pwodiksyon." },
        { status: 403 },
      );
    }
    if (providerName === "moncash" && !status.moncash) {
      return NextResponse.json(
        { error: "MonCash poko konfigire. Kontakte administratè a." },
        { status: 503 },
      );
    }
    if (providerName === "natcash" && !status.natcash) {
      return NextResponse.json(
        { error: "Natcash poko konfigire. Kontakte administratè a." },
        { status: 503 },
      );
    }

    // Create a PaymentIntent (pending — no wallet change yet).
    const intent = await db.paymentIntent.create({
      data: {
        bettorId: bettor.id,
        provider: providerName,
        amountCentimes,
        returnUrl: returnUrl ?? "/betting-wallet",
        expiresAt: new Date(Date.now() + 10 * 60_000), // 10 min
      },
    });

    // Ask the provider for a deposit intent (redirect URL).
    const provider = getProvider(providerName);
    let depositIntent;
    try {
      depositIntent = await provider.createDepositIntent({
        intentId: intent.id,
        bettorId: bettor.id,
        amountCentimes,
        returnUrl: returnUrl ?? "/betting-wallet",
      });
    } catch (e: any) {
      await db.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "failed" },
      });
      return NextResponse.json(
        { error: e?.message ?? "Pwovèdè peyman pa disponib." },
        { status: 503 },
      );
    }

    await logBettingAction({
      actorType: "system",
      actorId: bettor.id,
      action: "wallet.deposit.initiate",
      targetType: "payment_intent",
      targetId: intent.id,
      bettorId: bettor.id,
      afterState: { provider: providerName, amount: amountCentimes.toString() },
    });

    // Demo flow (dev/test only): immediately simulate a webhook.
    if (providerName === "demo" && process.env.NODE_ENV !== "production") {
      const webhookBody = JSON.stringify({
        intentId: intent.id,
        bettorId: bettor.id,
        amountCentimes: amountCentimes.toString(),
      });
      try {
        await fetch(`${req.nextUrl.origin}/api/betting/webhooks/demo`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: webhookBody,
        });
      } catch {}
      return NextResponse.json({
        ok: true, intentId: intent.id, status: "paid", provider: "demo",
      });
    }

    return NextResponse.json({
      ok: true,
      intentId: intent.id,
      status: "pending",
      provider: providerName,
      redirectUrl: depositIntent.redirectUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

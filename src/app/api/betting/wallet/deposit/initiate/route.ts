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
import { deposit } from "@/lib/betting/wallet";

export async function POST(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  // Rate limit: 3 deposit initiations per hour per bettor.
  const rl = await rateLimit("deposit_initiate", bettor.id, LIMITS.DEPOSIT.limit, LIMITS.DEPOSIT.windowMs);
  if (!rl.available) return NextResponse.json({ error: "Sèvis la pa disponib kounye a." }, { status: 503 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann depo. Eseye ankò pita." }, { status: 429 });
  }

  try {
    if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024) {
      return NextResponse.json({ error: "Done demann lan twò gwo." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Done demann lan pa valab." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Done demann lan pa valab." }, { status: 400 });
    }
    const { amountCentimes: amtStr, provider: providerName, returnUrl } = body as Record<string, unknown>;
    if (typeof amtStr !== "string" || !/^\d{1,12}$/.test(amtStr)) {
      return NextResponse.json({ error: "Montan pa valid." }, { status: 400 });
    }
    if (!["moncash", "natcash", "demo"].includes(providerName)) {
      return NextResponse.json({ error: "Pwovèdè peyman sa a pa sipòte." }, { status: 400 });
    }
    const amountCentimes = BigInt(amtStr);

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

    const requestedReturnUrl = returnUrl ?? "/betting-wallet";
    if (typeof requestedReturnUrl !== "string" || requestedReturnUrl.length > 2048) {
      return NextResponse.json({ error: "Adrès retou a pa valab." }, { status: 400 });
    }
    let safeReturnUrl: string;
    try {
      const parsed = new URL(requestedReturnUrl, req.nextUrl.origin);
      if (parsed.origin !== req.nextUrl.origin || !requestedReturnUrl.startsWith("/") || requestedReturnUrl.startsWith("//") || requestedReturnUrl.includes("\\")) {
        return NextResponse.json({ error: "Adrès retou a pa valab." }, { status: 400 });
      }
      safeReturnUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return NextResponse.json({ error: "Adrès retou a pa valab." }, { status: 400 });
    }

    // Create a PaymentIntent (pending — no wallet change yet).
    const intent = await db.paymentIntent.create({
      data: {
        bettorId: bettor.id,
        provider: providerName,
        amountCentimes,
        returnUrl: safeReturnUrl,
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
        returnUrl: safeReturnUrl,
      });
      if (
        depositIntent.provider !== providerName || depositIntent.intentId !== intent.id ||
        depositIntent.amountCentimes !== amountCentimes
      ) {
        throw new Error("Payment provider returned an invalid intent");
      }
      if (depositIntent.redirectUrl) {
        const checkout = new URL(depositIntent.redirectUrl);
        if (checkout.protocol !== "https:" || checkout.username || checkout.password) {
          throw new Error("Payment provider returned an unsafe checkout URL");
        }
      } else if (providerName !== "demo") {
        throw new Error("Payment provider did not return a checkout URL");
      }
      await db.paymentIntent.update({
        where: { id: intent.id },
        data: { redirectUrl: depositIntent.redirectUrl ?? null },
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
      await db.$transaction(async (tx) => {
        const claimed = await tx.paymentIntent.updateMany({
          where: { id: intent.id, provider: "demo", bettorId: bettor.id, amountCentimes, status: "pending" },
          data: {
            status: "paid",
            providerPaymentId: `demo-${intent.id}`,
            confirmedAt: new Date(),
            rawWebhookPayload: "dev-only simulated payment",
          },
        });
        if (claimed.count !== 1) throw new Error("Demo payment could not be confirmed");
        await deposit(bettor.id, amountCentimes, intent.id, tx);
      });
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

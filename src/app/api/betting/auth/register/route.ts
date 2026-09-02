// POST /api/betting/auth/register
//
// Creates a bettor account + wallet. Returns the session cookie.
//
// SECURITY (spec Part 5):
//   - Stronger password policy: min 8 chars, must contain a letter + digit.
//   - Rate limited: 5 registrations per hour per IP (account-spam protection).
//   - Email normalized to lowercase + trimmed.
//   - Password hashed with scrypt (server-only).
//   - No demo deposit in production — bettors start with 0 balance. In
//     dev/test, a 500 HTG seed deposit is created via the proper payment
//     flow (the demo webhook) so testing works without a real gateway.
//   - Audit logged.
//
// ACCOUNT VERIFICATION / KYC (future):
//   The `BettorStatus` enum supports ACTIVE / SUSPENDED / BANNED. A future
//   KYC integration will add a `verificationStatus` field (PENDING /
//   VERIFIED / REJECTED) + document upload. Until then, all new bettors
//   are ACTIVE but can only deposit via a verified payment provider —
//   no real money is created without a real payment.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createBettorSessionCookie } from "@/lib/betting/bettor-session";
import { logBettingAction } from "@/lib/betting/audit";
import { rateLimit, LIMITS, clientIp } from "@/lib/rate-limit";

/** Password policy: min 8 chars + at least one letter + one digit. */
function isStrongPassword(pw: string): { ok: boolean; reason?: string } {
  if (pw.length < 8) return { ok: false, reason: "Modpas dwe gen omwen 8 karaktè." };
  if (!/[a-zA-Z]/.test(pw)) return { ok: false, reason: "Modpas dwe gen omwen yon lèt." };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: "Modpas dwe gen omwen yon chif." };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per hour per IP.
  const ip = clientIp(req);
  const rl = rateLimit("register", ip, LIMITS.REGISTER.limit, LIMITS.REGISTER.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop demann enskripsyon. Eseye ankò pita." },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { email, password, displayName, phone } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Imèl ak modpas nesesè." }, { status: 400 });
    }
    const emailNorm = email.toLowerCase().trim();
    if (!emailNorm.includes("@") || emailNorm.length > 254) {
      return NextResponse.json({ error: "Imèl la pa valid." }, { status: 400 });
    }

    const pwCheck = isStrongPassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.reason }, { status: 400 });
    }

    // Check for existing account.
    const existing = await db.bettor.findUnique({ where: { email: emailNorm } });
    if (existing) {
      return NextResponse.json({ error: "Imèl sa a deja anrejistre." }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const bettor = await db.bettor.create({
      data: {
        email: emailNorm,
        passwordHash,
        displayName: displayName?.trim() || null,
        phone: phone?.trim() || null,
        status: "ACTIVE",
      },
    });

    // Create an empty wallet. In dev/test, credit 500 HTG via the proper
    // demo payment flow (the webhook). In production, the bettor starts
    // with 0 and must deposit via MonCash/Natcash.
    await db.wallet.create({ data: { bettorId: bettor.id } });

    if (process.env.NODE_ENV !== "production") {
      // Dev/test seed: simulate a verified demo payment of 500 HTG.
      try {
        const intent = await db.paymentIntent.create({
          data: {
            bettorId: bettor.id,
            provider: "demo",
            amountCentimes: 50000n,
            returnUrl: "/betting-wallet",
            status: "paid",
            providerPaymentId: `seed-${bettor.id}`,
            confirmedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        const { deposit } = await import("@/lib/betting/wallet");
        await deposit(bettor.id, 50000n, intent.id);
      } catch {}
    }

    await logBettingAction({
      actorType: "system",
      action: "bettor.register",
      targetType: "bettor",
      targetId: bettor.id,
      bettorId: bettor.id,
    });

    const cookie = createBettorSessionCookie(bettor.id, bettor.email);
    const res = NextResponse.json({
      ok: true,
      bettor: { id: bettor.id, email: bettor.email, displayName: bettor.displayName },
    });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (e: any) {
    console.error("[betting/register] error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Erè sèvè." }, { status: 500 });
  }
}

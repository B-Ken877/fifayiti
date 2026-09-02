// POST /api/betting/auth/login
// Body: { email, password }
// Returns the session cookie.
//
// SECURITY (spec Part 5): rate limited (10/min per IP+email combo) to
// protect against brute-force attacks. Failed attempts log to the audit
// trail so admins can detect attack patterns.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createBettorSessionCookie } from "@/lib/betting/bettor-session";
import { rateLimit, LIMITS, clientIp } from "@/lib/rate-limit";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "Imèl ak modpas nesesè." }, { status: 400 });
    }

    const emailNorm = email.toLowerCase().trim();
    const ip = clientIp(req);

    // Rate limit: 10/min per (ip, email) combo — brute-force protection.
    const rl = rateLimit(`login:${ip}:${emailNorm}`, emailNorm, LIMITS.LOGIN.limit, LIMITS.LOGIN.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop eseye. Kont ou oswa IP ou bloke pou kèk minit." },
        { status: 429 },
      );
    }

    const bettor = await db.bettor.findUnique({ where: { email: emailNorm } });
    if (!bettor || !verifyPassword(password, bettor.passwordHash)) {
      // Audit the failed attempt (do NOT reveal whether the email exists).
      await logBettingAction({
        actorType: "system",
        action: "bettor.login.failed",
        targetType: "bettor",
        reason: `ip=${ip} email=${emailNorm}`,
      }).catch(() => {});
      return NextResponse.json({ error: "Imèl oswa modpas la pa kòrèk." }, { status: 401 });
    }
    if (bettor.status !== "ACTIVE") {
      return NextResponse.json({ error: "Kont ou sispann. Kontakte administratè a." }, { status: 403 });
    }

    const cookie = createBettorSessionCookie(bettor.id, bettor.email);
    const res = NextResponse.json({
      ok: true,
      bettor: { id: bettor.id, email: bettor.email, displayName: bettor.displayName },
    });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

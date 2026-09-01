// POST /api/betting/auth/register
// Body: { email, password, displayName?, phone? }
// Creates a bettor account + wallet. Returns the session cookie.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createBettorSessionCookie } from "@/lib/betting/bettor-session";
import { logBettingAction } from "@/lib/betting/audit";
import { deposit } from "@/lib/betting/wallet";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, displayName, phone } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Imèl ak modpas nesesè." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Modpas dwe gen omwen 6 karaktè." }, { status: 400 });
    }
    if (!email.includes("@")) {
      return NextResponse.json({ error: "Imèl la pa valid." }, { status: 400 });
    }

    // Check for existing account.
    const existing = await db.bettor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: "Imèl sa a deja anrejistre." }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const bettor = await db.bettor.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        displayName: displayName?.trim() || null,
        phone: phone?.trim() || null,
        status: "ACTIVE",
      },
    });

    // Create wallet + a demo deposit so the user can try betting.
    // ⚠️ This is a SEED deposit for testing. Real deposits require a
    //    payment integration (MonCash/Natcash) — not yet wired.
    await db.wallet.create({ data: { bettorId: bettor.id } });
    await deposit(bettor.id, 50000n, "seed-deposit").catch(() => {});

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

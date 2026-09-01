// POST /api/betting/auth/login
// Body: { email, password }
// Returns the session cookie.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createBettorSessionCookie } from "@/lib/betting/bettor-session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "Imèl ak modpas nesesè." }, { status: 400 });
    }

    const bettor = await db.bettor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!bettor || !verifyPassword(password, bettor.passwordHash)) {
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

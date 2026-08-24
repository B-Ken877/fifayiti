// POST /api/auth/login
// Body: { email: string, password: string }
// 200 → { ok: true, role }  + sets fifayiti-session cookie
// 401 → { ok: false, error: "invalid_credentials" }
// 400 → { ok: false, error: "missing_fields" }

import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth/credentials";
import { createSessionCookie } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  // Slight artificial delay to blunt brute-force timing (scrypt already
  // adds ~50-80ms per attempt, but a fixed floor makes it uniform).
  const role = verifyCredentials(email, password);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: "invalid_credentials" },
      {
        status: 401,
        headers: { "Set-Cookie": "" }, // don't touch existing cookie on bad login
      },
    );
  }

  const res = NextResponse.json({ ok: true, role });
  res.headers.set("Set-Cookie", createSessionCookie(role));
  return res;
}

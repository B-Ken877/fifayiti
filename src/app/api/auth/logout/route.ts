// POST /api/auth/logout
// Clears the session cookie. Always returns 200.

import { NextResponse } from "next/server";
import { createExpiredCookie } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", createExpiredCookie());
  return res;
}

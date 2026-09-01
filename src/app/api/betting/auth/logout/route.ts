// POST /api/betting/auth/logout
// Expires the bettor session cookie.

import { NextResponse } from "next/server";
import { expireBettorCookie } from "@/lib/betting/bettor-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", expireBettorCookie());
  return res;
}

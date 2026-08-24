// GET /api/auth/me
// Returns the caller's current session role.
// 200 → { authed: true, role }
// 200 → { authed: false, role: null }   (not logged in / expired / tampered)

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) {
    return NextResponse.json({ authed: false, role: null });
  }
  return NextResponse.json({ authed: true, role });
}

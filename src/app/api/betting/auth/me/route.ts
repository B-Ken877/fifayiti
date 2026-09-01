// GET /api/betting/auth/me
// Returns the current bettor's profile (or 401 if not logged in).

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    bettor: {
      id: bettor.id,
      email: bettor.email,
      displayName: bettor.displayName,
      phone: bettor.phone,
      status: bettor.status,
    },
  });
}

// POST /api/betting/markets/[id]/close
// OPEN/SUSPENDED → CLOSED. Betting operator only.
// Closing stops new bets but doesn't settle (settlement happens on event).

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { transitionMarketStatus, pushMarketState } from "@/lib/betting/market-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role || !["betting_operator", "president", "director"].includes(role)) {
    return NextResponse.json({ error: "Ou pa gen dwa." }, { status: 403 });
  }

  const { id } = await params;

  // SUSPENDED → CLOSED (or OPEN → CLOSED — transitionMarketStatus allows both
  // via SUSPENDED, so suspend first then close).
  try {
    await transitionMarketStatus(id, "SUSPENDED", role);
  } catch {}
  await transitionMarketStatus(id, "CLOSED", role);
  await pushMarketState(id);

  return NextResponse.json({ ok: true, marketId: id, status: "CLOSED" });
}

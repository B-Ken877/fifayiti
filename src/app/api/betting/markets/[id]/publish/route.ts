// POST /api/betting/markets/[id]/publish
// Transition DRAFT → PUBLISHED → OPEN. Betting operator only.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { transitionMarketStatus, pushMarketState } from "@/lib/betting/market-state";
import { hasActiveMarket } from "@/lib/betting/market-state";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role || !["betting_operator", "president", "director"].includes(role)) {
    return NextResponse.json({ error: "Ou pa gen dwa." }, { status: 403 });
  }

  const { id } = await params;

  // Enforce one-active-market before publishing (DRAFT → PUBLISHED → OPEN).
  const market = await transitionMarketStatus(id, "PUBLISHED", role);
  // Immediately transition to OPEN (PUBLISHED is a transient state — the
  // market is OPEN for betting the moment it's published).
  const openMarket = await transitionMarketStatus(id, "OPEN", role);

  // Push to LiveKit so bettors see it immediately.
  await pushMarketState(id);

  return NextResponse.json({ ok: true, marketId: id, status: openMarket.status });
}

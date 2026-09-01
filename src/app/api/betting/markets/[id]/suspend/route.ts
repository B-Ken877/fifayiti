// POST /api/betting/markets/[id]/suspend
// OPEN → SUSPENDED. Betting operator only.

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
  await transitionMarketStatus(id, "SUSPENDED", role);
  await pushMarketState(id);

  return NextResponse.json({ ok: true, marketId: id, status: "SUSPENDED" });
}

// POST /api/betting/markets/[id]/suspend — OPEN → SUSPENDED. BETTING_OPERATOR only.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageBettingMarkets } from "@/lib/auth/permissions";
import { transitionMarketStatus, pushMarketState } from "@/lib/betting/market-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageBettingMarkets(role)) {
    return NextResponse.json({ error: "Sèlman operatè pariaj ka sispann mache." }, { status: 403 });
  }
  const { id } = await params;
  try {
    await transitionMarketStatus(id, "SUSPENDED", role);
    await pushMarketState(id);
    return NextResponse.json({ ok: true, marketId: id, status: "SUSPENDED" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 400 });
  }
}

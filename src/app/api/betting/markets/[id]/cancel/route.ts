// POST /api/betting/markets/[id]/cancel — Any → CANCELLED (refunds all bets).
// BETTING_OPERATOR only.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageBettingMarkets } from "@/lib/auth/permissions";
import { cancelMarket } from "@/lib/betting/settlement-engine";
import { clearActiveMarket } from "@/lib/betting/market-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageBettingMarkets(role)) {
    return NextResponse.json({ error: "Sèlman operatè pariaj ka anile mache." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? "Operatè a anile mache a.";
  const result = await cancelMarket(id, reason);
  await clearActiveMarket();
  return NextResponse.json({ ok: true, ...result });
}

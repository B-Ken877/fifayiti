// POST /api/betting/markets/[id]/cancel
// Any status → CANCELLED. Refunds all matched + open bets. Betting operator only.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { cancelMarket } from "@/lib/betting/settlement-engine";
import { clearActiveMarket } from "@/lib/betting/market-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role || !["betting_operator", "president", "director"].includes(role)) {
    return NextResponse.json({ error: "Ou pa gen dwa." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? "Operatè a anile mache a.";

  const result = await cancelMarket(id, reason);
  await clearActiveMarket();

  return NextResponse.json({ ok: true, ...result });
}

// POST /api/betting/operator/emergency-suspend
// Suspend ALL open markets immediately. Betting operator/admin only.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { suspendAllMarkets } from "@/lib/betting/settlement-engine";
import { clearActiveMarket } from "@/lib/betting/market-state";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role || !["betting_operator", "president", "director"].includes(role)) {
    return NextResponse.json({ error: "Ou pa gen dwa." }, { status: 403 });
  }

  const count = await suspendAllMarkets();
  await clearActiveMarket();

  await logBettingAction({
    actorType: "betting_operator",
    actorId: role,
    action: "operator.emergency_suspend",
    reason: "Manual emergency suspension",
    afterState: { suspendedCount: count },
  });

  return NextResponse.json({ ok: true, suspendedCount: count });
}

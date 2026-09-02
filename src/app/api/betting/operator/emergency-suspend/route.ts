// POST /api/betting/operator/emergency-suspend
//
// Kill switch: suspends ALL open betting markets immediately. Available
// to BETTING_OPERATOR + PRESIDENT + DIRECTOR (federation admins can kill
// betting during a crisis). RATE LIMITED (2/min) so a panicked operator
// can't spam it.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canTriggerEmergencySuspend } from "@/lib/auth/permissions";
import { suspendAllMarkets } from "@/lib/betting/settlement-engine";
import { clearActiveMarket } from "@/lib/betting/market-state";
import { logBettingAction } from "@/lib/betting/audit";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) {
    return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  }
  if (!canTriggerEmergencySuspend(role)) {
    return NextResponse.json(
      { error: "Ou pa gen dwa pou sispann urjans pariaj." },
      { status: 403 },
    );
  }

  // Rate limit: 2/min (kill switch — rare; prevents panic-spam).
  const rl = rateLimit("emergency_suspend", role, LIMITS.EMERGENCY.limit, LIMITS.EMERGENCY.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann urjans. Eseye ankò pita." }, { status: 429 });
  }

  const count = await suspendAllMarkets();
  await clearActiveMarket();

  await logBettingAction({
    actorType: role === "betting_operator" ? "betting_operator" : "admin",
    actorId: role,
    action: "operator.emergency_suspend",
    reason: "Manual emergency suspension",
    afterState: { suspendedCount: count },
  });

  return NextResponse.json({ ok: true, suspendedCount: count });
}

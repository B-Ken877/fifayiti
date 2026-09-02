// POST /api/betting/markets/[id]/publish
// Transition DRAFT → PUBLISHED → OPEN. BETTING_OPERATOR ONLY (spec Part 4).

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageBettingMarkets } from "@/lib/auth/permissions";
import { transitionMarketStatus, pushMarketState } from "@/lib/betting/market-state";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) {
    return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  }
  if (!canManageBettingMarkets(role)) {
    return NextResponse.json(
      { error: "Sèlman operatè pariaj ka pibliye mache." },
      { status: 403 },
    );
  }

  const rl = rateLimit("market_publish", role, LIMITS.MARKET_PUB.limit, LIMITS.MARKET_PUB.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann." }, { status: 429 });
  }

  const { id } = await params;

  try {
    await transitionMarketStatus(id, "PUBLISHED", role);
    const openMarket = await transitionMarketStatus(id, "OPEN", role);
    await pushMarketState(id);
    return NextResponse.json({ ok: true, marketId: id, status: openMarket.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 400 });
  }
}

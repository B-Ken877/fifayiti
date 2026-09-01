// GET /api/betting/markets/active
// Returns the current active market for the broadcast match (if any),
// including selections + liquidity. This is what the bettor UI polls.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMarket } from "@/lib/betting/market-state";
import { getMarketLiquidity } from "@/lib/betting/matching-engine";

export async function GET() {
  try {
    // Find the currently-live match (status AN_DIRÈK).
    const liveMatch = await db.match.findFirst({
      where: { status: "AN_DIRÈK" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!liveMatch) {
      return NextResponse.json({ active: false, market: null, match: null });
    }

    const market = await getActiveMarket(liveMatch.id);
    if (!market) {
      return NextResponse.json({
        active: false,
        market: null,
        match: {
          id: liveMatch.id,
          homeShort: liveMatch.homeTeam?.shortName,
          awayShort: liveMatch.awayTeam?.shortName,
          homeColor: liveMatch.homeTeam?.primaryColor,
          awayColor: liveMatch.awayTeam?.primaryColor,
          homeScore: liveMatch.homeScore,
          awayScore: liveMatch.awayScore,
          clock: liveMatch.clock,
          half: liveMatch.half,
        },
      });
    }

    const liquidity = await getMarketLiquidity(market.id);

    return NextResponse.json({
      active: true,
      market: {
        id: market.id,
        question: market.question,
        status: market.status,
        templateCode: market.template.code,
        selections: market.selections.map((s) => ({
          id: s.id,
          key: s.key,
          label: s.label,
        })),
        liquidity: liquidity.map((l) => ({
          selectionId: l.selectionId,
          stakeCentimes: l.stakeCentimes.toString(),
          openOrderCount: l.openOrderCount,
        })),
        match: {
          id: liveMatch.id,
          homeShort: liveMatch.homeTeam?.shortName,
          awayShort: liveMatch.awayTeam?.shortName,
          homeColor: liveMatch.homeTeam?.primaryColor,
          awayColor: liveMatch.awayTeam?.primaryColor,
          homeScore: liveMatch.homeScore,
          awayScore: liveMatch.awayScore,
          clock: liveMatch.clock,
          half: liveMatch.half,
        },
      },
    });
  } catch (e: any) {
    console.error("[betting/markets/active] error:", e?.message);
    return NextResponse.json({ active: false, market: null, error: e?.message }, { status: 500 });
  }
}

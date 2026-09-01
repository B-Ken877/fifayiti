// GET /api/betting/bets
// Returns the bettor's bets (open + matched + settled).

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const bets = await db.betOrder.findMany({
    where: { bettorId: bettor.id },
    include: {
      market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
      selection: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    bets: bets.map((b) => ({
      id: b.id,
      marketId: b.marketId,
      marketQuestion: b.market.question,
      marketStatus: b.market.status,
      selectionKey: b.selection.key,
      selectionLabel: b.selection.label,
      stakeCentimes: b.stakeCentimes.toString(),
      status: b.status,
      matchedAt: b.matchedAt?.toISOString() ?? null,
      settledAt: b.settledAt?.toISOString() ?? null,
      settleOutcome: b.settleOutcome,
      payoutCentimes: b.payoutCentimes?.toString() ?? null,
      matchHome: b.market.match?.homeTeam?.shortName,
      matchAway: b.market.match?.awayTeam?.shortName,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

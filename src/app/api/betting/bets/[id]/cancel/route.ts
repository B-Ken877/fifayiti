// POST /api/betting/bets/[id]/cancel
// Cancel an OPEN (unmatched) bet. Refunds reserved funds. Bettor only.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { cancelOpenBet } from "@/lib/betting/matching-engine";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const { id } = await params;
  const result = await cancelOpenBet(id, bettor.id);

  if (result.ok) {
    await logBettingAction({
      actorType: "system",
      actorId: bettor.id,
      action: "bet.cancel",
      targetType: "bet_order",
      targetId: id,
      bettorId: bettor.id,
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

// GET /api/matches/[id]/statistics
//
// Live match statistics aggregated from match events. Updates instantly
// after every operator action. Used by the TV page statistics tab and
// the operator desk.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await db.matchEvent.findMany({
      where: { matchId: id },
      orderBy: { recordedAt: "asc" },
    });

    const stats = {
      goals: events.filter((e: any) => e.kind === "GOL").length,
      yellowCards: events.filter((e: any) => e.kind === "KAT_JON").length,
      redCards: events.filter((e: any) => e.kind === "KAT_WOUJ").length,
      fouls: events.filter((e: any) => e.kind === "FOT").length,
      corners: events.filter((e: any) => e.kind === "KONÈ").length,
      substitutions: events.filter((e: any) => e.kind === "RANPLASMAN").length,
      totalEvents: events.length,
    };

    // Per-team breakdown
    const match = await db.match.findUnique({ where: { id } });
    const homeTeamId = match?.homeTeamId;
    const awayTeamId = match?.awayTeamId;

    const teamStats = (teamId: string | null | undefined) => ({
      goals: events.filter((e: any) => e.kind === "GOL" && e.teamId === teamId).length,
      yellowCards: events.filter((e: any) => e.kind === "KAT_JON" && e.teamId === teamId).length,
      redCards: events.filter((e: any) => e.kind === "KAT_WOUJ" && e.teamId === teamId).length,
      fouls: events.filter((e: any) => e.kind === "FOT" && e.teamId === teamId).length,
      corners: events.filter((e: any) => e.kind === "KONÈ" && e.teamId === teamId).length,
    });

    return NextResponse.json({
      stats,
      home: teamStats(homeTeamId),
      away: teamStats(awayTeamId),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

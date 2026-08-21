import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET  /api/matches       — list all matches (optionally filtered by competitionId, stage)
 * POST /api/matches       — schedule a new match
 *
 * Query params (GET): ?competitionId=...&stage=GROUP&groupLabel=A&status=PWOGRAM
 *
 * Body for POST:
 *   { homeTeamId, awayTeamId, kickoff (ISO), venue?, competition?,
 *     competitionId?, matchday?, stage?, groupLabel?, bracketSlot?, referee?, commissioner? }
 */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competitionId");
    const stage = url.searchParams.get("stage");
    const status = url.searchParams.get("status");
    const groupLabel = url.searchParams.get("groupLabel");

    const where: any = {};
    if (competitionId) where.competitionId = competitionId;
    if (stage) where.stage = stage;
    if (status) where.status = status;
    if (groupLabel) where.groupLabel = groupLabel;

    const matches = await db.match.findMany({
      where,
      orderBy: { kickoff: "asc" },
      include: { events: { orderBy: { minute: "asc" } } },
    });
    return NextResponse.json({ matches });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.homeTeamId || !body.awayTeamId || body.homeTeamId === body.awayTeamId) {
      return NextResponse.json(
        { error: "homeTeamId and awayTeamId must be different" },
        { status: 400 }
      );
    }
    const match = await db.match.create({
      data: {
        competitionId: body.competitionId ?? null,
        matchday: Number(body.matchday ?? 1),
        stage: body.stage ?? "GROUP",
        groupLabel: body.groupLabel ?? null,
        bracketSlot: body.bracketSlot ?? null,
        homeTeamId: body.homeTeamId,
        awayTeamId: body.awayTeamId,
        kickoff: body.kickoff ? new Date(body.kickoff) : new Date(),
        venue: body.venue ?? null,
        competitionName: body.competitionName ?? body.competition ?? "FIFAYITI",
        referee: body.referee ?? null,
        commissioner: body.commissioner ?? null,
        status: "PWOGRAM",
        clock: 0,
        half: "PRE",
      },
    });
    return NextResponse.json({ match }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/competitions/[id]/generate-schedule
 *
 * Generates round-robin group-stage matches for the competition.
 *
 * Algorithm: circle method (n-1 rounds for n teams in single round-robin,
 * 2*(n-1) rounds for double round-robin).
 *
 * Optionally takes `startDate` and `daysBetweenRounds` from the body to
 * schedule kickoffs across multiple days. Defaults: matches spread over
 * n-1 days starting today.
 *
 * Existing GROUP matches for this competition are deleted before regeneration.
 */

/** Circle method — produces (n-1) rounds of (n/2) matches each. */
function circleMethod(teams: string[]): Array<Array<[string, string]>> {
  const arr = [...teams];
  if (arr.length % 2 === 1) arr.push("BYE");
  const n = arr.length;
  const half = n / 2;
  const rounds: Array<Array<[string, string]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const matches: Array<[string, string]> = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") {
        // Alternate home/away per round so no team is always home
        if (r % 2 === 1 && i !== 0) matches.push([b, a]);
        else matches.push([a, b]);
      }
    }
    rounds.push(matches);
    // Rotate: keep index 0 fixed, move last to position 1
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }
  return rounds;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const startDateStr = body.startDate;
    const daysBetweenRounds = Number(body.daysBetweenRounds ?? 1);

    const comp = await db.competition.findUnique({
      where: { id },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!comp) return NextResponse.json({ error: "competition not found" }, { status: 404 });

    // Delete existing GROUP-stage matches for this competition
    await db.match.deleteMany({
      where: { competitionId: id, stage: "GROUP" },
    });

    const startDate = startDateStr ? new Date(startDateStr) : new Date();
    startDate.setHours(18, 0, 0, 0); // 6pm default kickoff

    const rrRounds = comp.rrType === "DOUBLE" ? 2 : 1;
    let totalCreated = 0;

    for (const group of comp.groups) {
      const teamIds = group.teams.map((tr) => tr.teamId);
      if (teamIds.length < 2) continue;

      const rounds = circleMethod(teamIds);

      for (let pass = 0; pass < rrRounds; pass++) {
        for (let r = 0; r < rounds.length; r++) {
          const matches = rounds[r];
          // Determine day offset for this matchday
          const dayOffset = (pass * rounds.length + r) * daysBetweenRounds;
          const kickoff = new Date(startDate);
          kickoff.setDate(kickoff.getDate() + dayOffset);
          // Stagger kickoff times within the same day (group matches can play sequentially)
          kickoff.setHours(18 + (r % 3) * 2, 0, 0, 0);

          for (const [homeId, awayId] of matches) {
            // In the second pass, swap home/away (double round-robin)
            const home = pass === 1 ? awayId : homeId;
            const away = pass === 1 ? homeId : awayId;

            await db.match.create({
              data: {
                competitionId: id,
                matchday: pass * rounds.length + r + 1,
                stage: "GROUP",
                groupId: group.id,
                groupLabel: group.name,
                bracketSlot: null,
                homeTeamId: home,
                awayTeamId: away,
                kickoff,
                venue: null,
                competitionName: comp.name,
                status: "PWOGRAM",
                clock: 0,
                half: "PRE",
              },
            });
            totalCreated++;
          }
        }
      }
    }

    const updated = await db.competition.findUnique({
      where: { id },
      include: {
        groups: { include: { teams: { include: { team: true } } } },
        matches: { orderBy: { kickoff: "asc" } },
      },
    });
    return NextResponse.json({
      competition: updated,
      matchesCreated: totalCreated,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

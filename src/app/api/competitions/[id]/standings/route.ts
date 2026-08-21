import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/competitions/[id]/standings
 *
 * Computes per-group standings for the competition, derived entirely from
 * FINI + AN_DIRÈK matches in the group stage.
 *
 * Returns: { groups: [{ name, teams: [TeamRecord] }] }
 *
 * Standings tiebreaker cascade (FIFA-style):
 *   1. Points (W=3, D=1, L=0)
 *   2. Goal difference
 *   3. Goals scored
 *   4. (Tied) — stable sort preserves group order
 */
interface TeamRecord {
  teamId: string;
  teamName: string;
  teamShortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comp = await db.competition.findUnique({
      where: { id },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
        matches: {
          where: { stage: "GROUP" },
        },
      },
    });
    if (!comp) return NextResponse.json({ error: "not found" }, { status: 404 });

    const groups = comp.groups.map((g) => {
      const records: TeamRecord[] = g.teams.map((tr) => ({
        teamId: tr.team.id,
        teamName: tr.team.name,
        teamShortName: tr.team.shortName,
        primaryColor: tr.team.primaryColor,
        secondaryColor: tr.team.secondaryColor,
        logoUrl: tr.team.logoUrl,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      }));

      for (const m of comp.matches) {
        if (m.groupId !== g.id) continue;
        if (m.status !== "FINI" && m.status !== "AN_DIRÈK") continue;
        const home = records.find((r) => r.teamId === m.homeTeamId);
        const away = records.find((r) => r.teamId === m.awayTeamId);
        if (!home || !away) continue;
        home.played++;
        away.played++;
        home.goalsFor += m.homeScore;
        home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore;
        away.goalsAgainst += m.homeScore;
        if (m.homeScore > m.awayScore) {
          home.won++; home.points += 3; away.lost++;
        } else if (m.homeScore < m.awayScore) {
          away.won++; away.points += 3; home.lost++;
        } else {
          home.drawn++; home.points += 1;
          away.drawn++; away.points += 1;
        }
      }
      for (const r of records) {
        r.goalDifference = r.goalsFor - r.goalsAgainst;
      }
      // Sort by tiebreaker cascade
      records.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return 0;
      });

      return {
        id: g.id,
        name: g.name,
        teams: records,
      };
    });

    return NextResponse.json({ groups });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

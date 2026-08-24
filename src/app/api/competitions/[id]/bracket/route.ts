import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/competitions/[id]/bracket
 *
 * Returns the knockout bracket structure for the competition.
 *
 * Bracket slots are determined by competition.qualifiersPerGroup + competition.groupCount:
 *   - Total qualifiers = groupCount * qualifiersPerGroup
 *   - Knockout size = next power of 2 >= total qualifiers
 *
 * For each slot we either return:
 *   - { status: "scheduled", match: {...} } if a match exists in DB
 *   - { status: "pending", slot, dependentOn } if it depends on a group result
 *
 * NOTE: For now, knockout matches are not auto-generated. The president/admin
 * can create them manually once the group stage is finished, by POSTing to
 * /api/matches with the desired bracketSlot. This endpoint just returns
 * whatever knockout matches exist for the competition, plus the bracket layout.
 */

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function stageForRound(round: number, totalRounds: number): string {
  // round 1 = first knockout round (largest), round = totalRounds = final
  if (round === totalRounds) return "FIN";
  if (round === totalRounds - 1) return "SF";
  if (round === totalRounds - 2) return "QF";
  if (round === totalRounds - 3) return "R16";
  return "R32";
}

/** Stages in knockout order — used to derive the match stage from a slot. */
const KO_STAGES = ["R32", "R16", "QF", "SF", "FIN", "THIRD_PLACE"];

/**
 * POST /api/competitions/[id]/bracket
 *
 * Create or update the knockout match for a bracket slot ("QF-1", "SF-2",
 * "FIN-1", "THIRD_PLACE-1", ...). This is the admin workflow for building
 * the bracket round by round: pick the two teams that meet in this slot.
 *
 * Body: { slot, homeTeamId, awayTeamId, kickoff?, venue? }
 *
 * Rules:
 *   - Both teams must be registered in this competition.
 *   - homeTeamId and awayTeamId must differ.
 *   - If a match already exists for the slot:
 *       - teams can only be changed while the match is still PWOGRAM
 *       - kickoff/venue can be edited any time
 *   - If no match exists, one is created (stage derived from the slot).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const slot = String(body.slot ?? "");
    const homeTeamId = body.homeTeamId ? String(body.homeTeamId) : "";
    const awayTeamId = body.awayTeamId ? String(body.awayTeamId) : "";

    if (!slot || !homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: "slot, homeTeamId ak awayTeamId obligatwa" },
        { status: 400 }
      );
    }
    if (homeTeamId === awayTeamId) {
      return NextResponse.json(
        { error: "De ekip yo dwe diferan" },
        { status: 400 }
      );
    }

    const [slotStage] = slot.split("-");
    if (!KO_STAGES.includes(slotStage)) {
      return NextResponse.json({ error: `slot invalide: ${slot}` }, { status: 400 });
    }

    const comp = await db.competition.findUnique({
      where: { id },
      include: { registrations: true },
    });
    if (!comp) return NextResponse.json({ error: "competition not found" }, { status: 404 });

    const registered = new Set(comp.registrations.map((r) => r.teamId));
    for (const tid of [homeTeamId, awayTeamId]) {
      if (!registered.has(tid)) {
        return NextResponse.json(
          { error: "Ekip sa a pa enskri nan konpetisyon sa a" },
          { status: 400 }
        );
      }
    }

    const existing = await db.match.findFirst({
      where: { competitionId: id, bracketSlot: slot },
    });

    const kickoff = body.kickoff ? new Date(body.kickoff) : undefined;
    if (kickoff && isNaN(kickoff.getTime())) {
      return NextResponse.json({ error: "kickoff invalide" }, { status: 400 });
    }

    let match;
    if (existing) {
      const teamsChanged =
        existing.homeTeamId !== homeTeamId || existing.awayTeamId !== awayTeamId;
      if (teamsChanged && existing.status !== "PWOGRAM") {
        return NextResponse.json(
          { error: "match sa a deja kòmanse — ou pa ka chanje ekip yo" },
          { status: 409 }
        );
      }
      match = await db.match.update({
        where: { id: existing.id },
        data: {
          ...(teamsChanged ? { homeTeamId, awayTeamId } : {}),
          ...(kickoff ? { kickoff } : {}),
          ...(body.venue !== undefined ? { venue: body.venue ?? null } : {}),
        },
        include: { homeTeam: true, awayTeam: true },
      });
    } else {
      match = await db.match.create({
        data: {
          competitionId: id,
          matchday: 99, // knockout matches sort after group matchdays
          stage: slotStage === "THIRD_PLACE" ? "THIRD_PLACE" : slotStage,
          groupId: null,
          groupLabel: null,
          bracketSlot: slot,
          homeTeamId,
          awayTeamId,
          kickoff: kickoff ?? new Date(),
          venue: body.venue ?? null,
          competitionName: comp.name,
          status: "PWOGRAM",
          clock: 0,
          half: "PRE",
        },
        include: { homeTeam: true, awayTeam: true },
      });
    }

    return NextResponse.json({ match }, { status: existing ? 200 : 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
        groups: { include: { teams: { include: { team: true } } }, orderBy: { name: "asc" } },
        matches: {
          where: { stage: { in: ["R32", "R16", "QF", "SF", "FIN", "THIRD_PLACE"] } },
          include: {
            homeTeam: true, awayTeam: true,
            events: true,
          },
        },
      },
    });
    if (!comp) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (!comp.hasKnockoutPhase) {
      return NextResponse.json({ bracket: null, message: "No knockout phase for this competition." });
    }

    const totalQualifiers = comp.groupCount * comp.qualifiersPerGroup;
    const bracketSize = nextPow2(totalQualifiers);
    const totalRounds = Math.log2(bracketSize);

    // Build rounds layout
    const rounds: Array<{
      round: number;
      stage: string;
      label: string;
      matches: Array<any>;
    }> = [];

    for (let r = 1; r <= totalRounds; r++) {
      const stage = stageForRound(r, totalRounds);
      const matchCount = bracketSize / Math.pow(2, r);
      const label =
        stage === "FIN" ? "Final"
        : stage === "SF" ? "Demifinal"
        : stage === "QF" ? "Kat final"
        : stage === "R16" ? "8yèm final"
        : "16yèm final";

      const matchesInRound: any[] = [];
      for (let m = 1; m <= matchCount; m++) {
        const slot = `${stage}-${m}`;
        const dbMatch = comp.matches.find((mm) => mm.bracketSlot === slot);
        if (dbMatch) {
          matchesInRound.push({
            slot,
            status: "scheduled",
            match: dbMatch,
          });
        } else {
          matchesInRound.push({
            slot,
            status: "pending",
            // Will be filled by admin once group stage is complete
          });
        }
      }

      rounds.push({ round: r, stage, label, matches: matchesInRound });
    }

    // Add third-place match if enabled
    if (comp.hasThirdPlaceMatch && totalRounds >= 2) {
      const slot = "THIRD_PLACE-1";
      const dbMatch = comp.matches.find((mm) => mm.bracketSlot === slot);
      rounds.push({
        round: totalRounds + 1,
        stage: "THIRD_PLACE",
        label: "3yèm plas",
        matches: dbMatch
          ? [{ slot, status: "scheduled", match: dbMatch }]
          : [{ slot, status: "pending" }],
      });
    }

    return NextResponse.json({
      bracket: {
        size: bracketSize,
        totalRounds: rounds.length,
        rounds,
        groupQualifiersPerGroup: comp.qualifiersPerGroup,
        groupCount: comp.groupCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

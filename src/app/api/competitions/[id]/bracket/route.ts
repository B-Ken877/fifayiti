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

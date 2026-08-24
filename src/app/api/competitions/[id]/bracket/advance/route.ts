import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/competitions/[id]/bracket/advance
 *
 * Advance a team into the next round of the knockout bracket.
 *
 * Body: { fromSlot, winnerTeamId, toSlot? }
 *   - fromSlot     the slot the team is coming FROM, e.g. "QF-1"
 *   - winnerTeamId the team being advanced (must be one of fromSlot's teams)
 *   - toSlot       optional override — defaults to the computed next slot
 *                  (e.g. QF-1 → SF-1, QF-2 → SF-1 away side, SF-1 → FIN-1).
 *                  Used e.g. to route semifinal LOSERS to "THIRD_PLACE-1".
 *
 * Side rules (standard bracket feeding):
 *   - QF-1 winner → SF-1 HOME, QF-2 winner → SF-1 AWAY
 *   - SF-1 winner → FIN-1 HOME, SF-2 winner → FIN-1 AWAY
 *   - (odd feeder number → home side, even → away side)
 *
 * If the target slot already has a match (and it hasn't started), the team is
 * placed on the correct side — one click. If the target slot has NO match
 * yet, the response carries `needsCreation: true` with the slot/side/team so
 * the admin UI can open that slot's form pre-filled (both teams must be
 * picked before a match can be created — the DB requires both sides).
 */

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "FIN"];

function parseSlot(slot: string): { stage: string; num: number } | null {
  const m = /^([A-Z0-9_]+)-(\d+)$/.exec(slot ?? "");
  if (!m) return null;
  return { stage: m[1], num: parseInt(m[2], 10) };
}

/** Compute the default destination slot for a feeder slot. */
function nextSlotOf(slot: string): string | null {
  const parsed = parseSlot(slot);
  if (!parsed) return null;
  const idx = STAGE_ORDER.indexOf(parsed.stage);
  // FIN has no next round (its winner is the champion).
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return `${STAGE_ORDER[idx + 1]}-${Math.ceil(parsed.num / 2)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const fromSlot = String(body.fromSlot ?? "");
    const winnerTeamId = String(body.winnerTeamId ?? "");
    const toSlotOverride = body.toSlot ? String(body.toSlot) : null;

    if (!fromSlot || !winnerTeamId) {
      return NextResponse.json(
        { error: "fromSlot ak winnerTeamId obligatwa" },
        { status: 400 }
      );
    }

    const comp = await db.competition.findUnique({ where: { id } });
    if (!comp) return NextResponse.json({ error: "competition not found" }, { status: 404 });

    // Validate the source match: the advanced team must belong to it.
    const fromMatch = await db.match.findFirst({
      where: { competitionId: id, bracketSlot: fromSlot },
    });
    if (!fromMatch) {
      return NextResponse.json(
        { error: `pa gen match pou slot ${fromSlot}` },
        { status: 404 }
      );
    }
    if (winnerTeamId !== fromMatch.homeTeamId && winnerTeamId !== fromMatch.awayTeamId) {
      return NextResponse.json(
        { error: "Ekip sa a pa nan match sa a" },
        { status: 400 }
      );
    }
    if (fromMatch.status !== "FINI") {
      return NextResponse.json(
        { error: "Match la poko fini — ou pa ka avanse yon ekip" },
        { status: 409 }
      );
    }

    // Destination
    const toSlot = toSlotOverride ?? nextSlotOf(fromSlot);
    if (!toSlot) {
      return NextResponse.json(
        { error: "Slot sa a pa gen tur swivan (gayan an se chanpyon an)" },
        { status: 400 }
      );
    }

    // Side: odd feeder number → home side of the target, even → away side.
    const fromParsed = parseSlot(fromSlot);
    const side = fromParsed && fromParsed.num % 2 === 0 ? "away" : "home";

    const targetMatch = await db.match.findFirst({
      where: { competitionId: id, bracketSlot: toSlot },
    });

    if (!targetMatch) {
      // No match exists at the destination yet — the admin must pick both
      // teams before it can be created (both sides are required in the DB).
      return NextResponse.json({
        needsCreation: true,
        toSlot,
        side,
        winnerTeamId,
      });
    }

    if (targetMatch.status !== "PWOGRAM") {
      return NextResponse.json(
        { error: `Match ${toSlot} deja kòmanse — ou pa ka chanje ekip yo` },
        { status: 409 }
      );
    }

    // Don't place the same team on both sides.
    const otherSide =
      side === "home" ? targetMatch.awayTeamId : targetMatch.homeTeamId;
    if (otherSide === winnerTeamId) {
      return NextResponse.json(
        { error: "Ekip sa a deja nan lòt bò match sa a" },
        { status: 409 }
      );
    }

    const data: Record<string, any> = {};
    data[side === "home" ? "homeTeamId" : "awayTeamId"] = winnerTeamId;

    const updated = await db.match.update({
      where: { id: targetMatch.id },
      data,
      include: { homeTeam: true, awayTeam: true },
    });

    return NextResponse.json({
      match: updated,
      toSlot,
      side,
      winnerTeamId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

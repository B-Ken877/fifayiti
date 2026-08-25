import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { triggerBroadcastReplay } from "@/lib/streaming/replay-engine";

/**
 * POST /api/matches/[id]/events
 *
 * Body: { kind, teamId?, playerInId?, playerOutId?, description?, minute?, half? }
 *
 * If kind === "GOL", the corresponding team's score is incremented.
 * If kind === "KAT_WOUJ" or "KAT_JON" or "RANPLASMAN", only the event is recorded.
 */

const HALF_LENGTH_SECONDS = 30 * 60; // 30 minutes per half

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.kind) {
      return NextResponse.json({ error: "kind is required" }, { status: 400 });
    }
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }

    // Determine the current minute (clock seconds → minute number)
    const minute = body.minute ?? Math.floor((match.clock ?? 0) / 60);
    const half = body.half ?? (match.half === "2" ? 2 : 1);

    const event = await db.matchEvent.create({
      data: {
        matchId: id,
        minute,
        half,
        kind: body.kind,
        teamId: body.teamId ?? null,
        playerInId: body.playerInId ?? null,
        playerOutId: body.playerOutId ?? null,
        description: body.description ?? "",
        recordedAt: new Date(),
      },
    });

    // Side-effects on the match itself
    const updates: Record<string, any> = {};
    if (body.kind === "GOL" && body.teamId) {
      if (body.teamId === match.homeTeamId) {
        updates.homeScore = (match.homeScore ?? 0) + 1;
      } else if (body.teamId === match.awayTeamId) {
        updates.awayScore = (match.awayScore ?? 0) + 1;
      }
    }
    if (body.kind === "KOMANSE") {
      updates.status = "AN_DIRÈK";
      updates.half = "1";
      updates.clock = 0;
    } else if (body.kind === "MWATYE_TAN") {
      updates.half = "HT";
      updates.clock = HALF_LENGTH_SECONDS;
    } else if (body.kind === "DEZYEM_MITAN") {
      updates.half = "2";
      updates.clock = 0;
    } else if (body.kind === "FEN_MATCH") {
      updates.status = "FINI";
      updates.half = "POST";
    }

    let updatedMatch = match;
    if (Object.keys(updates).length > 0) {
      updatedMatch = await db.match.update({ where: { id }, data: updates });
    }

    // ── INSTANT REPLAY (Task 17) ──────────────────────────────────────
    // A confirmed GOL triggers an automatic broadcast replay built from
    // the ON-AIR HLS recording (previous 5s normal + same 5s at 0.5x).
    // Fire-and-forget: replay failures NEVER affect the event or the live
    // broadcast — the engine logs and gives up on its own.
    if (body.kind === "GOL") {
      void triggerBroadcastReplay({
        kind: "GOL",
        matchId: id,
        eventId: event.id,
        teamId: body.teamId ?? null,
        playerInId: body.playerInId ?? null,
        description: body.description ?? "",
        minute,
      }).catch((err) => {
        console.error("[events] instant replay trigger failed:", err?.message ?? err);
      });
    }

    return NextResponse.json({ event, match: updatedMatch }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

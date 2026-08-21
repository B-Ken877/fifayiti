import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET   /api/matches/[id]   — fetch a match with events + replays
 * PATCH /api/matches/[id]   — update match fields (score, status, etc.)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const match = await db.match.findUnique({
      where: { id },
      include: { events: { orderBy: { minute: "asc" } }, replays: true },
    });
    if (!match) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ match });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, any> = {};
    for (const k of [
      "homeScore", "awayScore", "status", "clock", "half",
      "kickoff", "venue", "referee", "commissioner", "matchday", "stage", "groupLabel",
    ]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const match = await db.match.update({
      where: { id },
      data,
      include: { events: { orderBy: { minute: "asc" } }, replays: true },
    });
    return NextResponse.json({ match });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

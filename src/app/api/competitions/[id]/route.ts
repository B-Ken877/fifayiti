import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET    /api/competitions/[id]   — fetch a single competition with groups + registrations
 * PATCH  /api/competitions/[id]   — update fields
 * DELETE /api/competitions/[id]   — delete competition (cascade-deletes groups + registrations + matches)
 */

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
            teams: {
              include: { team: true },
              orderBy: { seedNumber: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
        registrations: { include: { team: true } },
        matches: {
          include: { events: true },
          orderBy: { kickoff: "asc" },
        },
      },
    });
    if (!comp) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ competition: comp });
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
      "name", "season", "status", "format", "rrType",
      "groupCount", "teamsPerGroup", "qualifiersPerGroup",
      "hasThirdPlaceMatch", "hasKnockoutPhase",
      "startDate", "endDate",
    ]) {
      if (body[k] !== undefined) {
        if (["groupCount", "teamsPerGroup", "qualifiersPerGroup"].includes(k)) {
          data[k] = Number(body[k]);
        } else if (["hasThirdPlaceMatch", "hasKnockoutPhase"].includes(k)) {
          data[k] = Boolean(body[k]);
        } else if (["startDate", "endDate"].includes(k)) {
          data[k] = body[k] ? new Date(body[k]) : null;
        } else {
          data[k] = body[k];
        }
      }
    }
    const comp = await db.competition.update({
      where: { id },
      data,
      include: { groups: true },
    });
    return NextResponse.json({ competition: comp });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.competition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

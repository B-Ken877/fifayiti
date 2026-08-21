import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET    /api/teams/[id]         — fetch a single team with its players
 * PATCH  /api/teams/[id]         — update team fields
 * DELETE /api/teams/[id]         — delete team (cascade-deletes players)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const team = await db.team.findUnique({
      where: { id },
      include: { players: { orderBy: { jerseyNumber: "asc" } } },
    });
    if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ team });
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
    // Strip undefined fields so Prisma doesn't error on them
    const data: Record<string, any> = {};
    for (const k of [
      "name", "shortName", "primaryColor", "secondaryColor", "founded",
      "homeVenue", "venueAddress", "venueRouter", "venueConnectivity",
      "group", "logoUrl", "photoUrl", "status", "registeredAt",
    ]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const team = await db.team.update({
      where: { id },
      data,
      include: { players: true },
    });
    return NextResponse.json({ team });
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
    await db.team.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

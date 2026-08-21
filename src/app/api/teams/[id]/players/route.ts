import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET  /api/teams/[id]/players  — list players on this team
 * POST /api/teams/[id]/players  — add a new player to this team
 *
 * Body for POST:
 *   { firstName, lastName, jerseyNumber, position, dateOfBirth?,
 *     idNumber?, photoUrl?, status? }
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const players = await db.player.findMany({
      where: { teamId: id },
      orderBy: { jerseyNumber: "asc" },
    });
    return NextResponse.json({ players });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.firstName || !body.lastName || !body.jerseyNumber || !body.position) {
      return NextResponse.json(
        { error: "firstName, lastName, jerseyNumber, position are required" },
        { status: 400 }
      );
    }
    // Verify team exists
    const team = await db.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: "team not found" }, { status: 404 });
    }
    // Check jersey uniqueness within the team
    const existing = await db.player.findUnique({
      where: { teamId_jerseyNumber: { teamId: id, jerseyNumber: Number(body.jerseyNumber) } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Nimewo ${body.jerseyNumber} deja pran sou ekip sa` },
        { status: 409 }
      );
    }
    const player = await db.player.create({
      data: {
        teamId: id,
        firstName: body.firstName,
        lastName: body.lastName,
        jerseyNumber: Number(body.jerseyNumber),
        position: body.position,
        dateOfBirth: body.dateOfBirth ?? null,
        idNumber: body.idNumber ?? null,
        photoUrl: body.photoUrl ?? null,
        status: body.status ?? "AN_ATANT",
        submittedAt: new Date().toISOString().slice(0, 10),
      },
    });
    return NextResponse.json({ player }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

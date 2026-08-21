import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/teams  — list all teams (with players + counts)
 * POST /api/teams — create a new team
 *
 * Body for POST:
 *   { name, shortName, primaryColor?, secondaryColor?, founded?,
 *     homeVenue?, venueAddress?, venueRouter?, venueConnectivity?,
 *     group?, logoUrl?, photoUrl? }
 */
export async function GET() {
  try {
    const teams = await db.team.findMany({
      include: { players: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ teams });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.shortName) {
      return NextResponse.json(
        { error: "name and shortName are required" },
        { status: 400 }
      );
    }
    const team = await db.team.create({
      data: {
        name: body.name,
        shortName: body.shortName,
        primaryColor: body.primaryColor ?? "#116B3A",
        secondaryColor: body.secondaryColor ?? "#F4C400",
        founded: body.founded ?? "",
        homeVenue: body.homeVenue ?? "",
        venueAddress: body.venueAddress ?? "",
        venueRouter: body.venueRouter ?? "",
        venueConnectivity: body.venueConnectivity ?? "MOYEN",
        group: body.group ?? "A",
        logoUrl: body.logoUrl ?? null,
        photoUrl: body.photoUrl ?? null,
        status: "AKTIF",
        registeredAt: new Date().toISOString().slice(0, 10),
      },
      include: { players: true },
    });
    return NextResponse.json({ team }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

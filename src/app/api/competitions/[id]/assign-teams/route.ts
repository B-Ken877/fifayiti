import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/competitions/[id]/assign-teams
 *
 * Body: { assignments: [{ teamId, groupName }] }
 *
 * - Removes all existing TeamRegistration rows for this competition
 * - Creates new TeamRegistration rows (one per team), linked to the named group.
 * - Returns the updated competition with groups + registrations.
 *
 * Each team must already exist in the Team table. Teams can be assigned to
 * any group defined on the competition (groups A..K by groupCount).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const assignments: Array<{ teamId: string; groupName?: string | null; seedNumber?: number }> =
      body.assignments ?? [];

    const comp = await db.competition.findUnique({
      where: { id },
      include: { groups: true },
    });
    if (!comp) return NextResponse.json({ error: "competition not found" }, { status: 404 });

    // Validate team ids
    const teamIds = assignments.map((a) => a.teamId);
    const teams = await db.team.findMany({ where: { id: { in: teamIds } } });
    const found = new Set(teams.map((t) => t.id));
    const missing = teamIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `some teams not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    // Wipe existing registrations
    await db.teamRegistration.deleteMany({ where: { competitionId: id } });

    // Build group lookup by name
    const groupByName = new Map(comp.groups.map((g) => [g.name, g]));

    // Create new registrations
    const data = assignments.map((a, idx) => ({
      competitionId: id,
      teamId: a.teamId,
      groupId: a.groupName ? groupByName.get(a.groupName)?.id ?? null : null,
      seedNumber: a.seedNumber ?? idx + 1,
    }));
    if (data.length > 0) {
      await db.teamRegistration.createMany({ data });
    }

    const updated = await db.competition.findUnique({
      where: { id },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
        registrations: { include: { team: true } },
      },
    });
    return NextResponse.json({ competition: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

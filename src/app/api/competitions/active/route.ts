import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/competitions/active  — fetch the currently active competition
 *
 * "Active" = IN_PROGRESS if any, else OPEN, else the most recently created.
 * Returns null if there are no competitions at all.
 */
export async function GET() {
  try {
    // Prefer IN_PROGRESS, then OPEN, then most-recent
    const inProgress = await db.competition.findFirst({
      where: { status: "IN_PROGRESS" },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (inProgress) return NextResponse.json({ competition: inProgress });

    const open = await db.competition.findFirst({
      where: { status: "OPEN" },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (open) return NextResponse.json({ competition: open });

    const latest = await db.competition.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        groups: {
          include: {
            teams: { include: { team: true }, orderBy: { seedNumber: "asc" } },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    return NextResponse.json({ competition: latest });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET  /api/competitions            — list all competitions
 * POST /api/competitions            — create a new competition
 *
 * Body for POST:
 *   { name, season?, format?, rrType?, groupCount?, teamsPerGroup?,
 *     qualifiersPerGroup?, hasThirdPlaceMatch?, hasKnockoutPhase?,
 *     startDate?, endDate?, status? }
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  try {
    const comps = await db.competition.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { matches: true, registrations: true } },
        groups: { include: { teams: { include: { team: true } } } },
      },
    });
    return NextResponse.json({ competitions: comps });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const name = String(body.name).trim();
    const season = String(body.season ?? String(new Date().getFullYear()));
    let slug = slugify(name) + "-" + season;
    let suffix = 1;
    while (await db.competition.findUnique({ where: { slug } })) {
      slug = slugify(name) + "-" + season + "-" + suffix++;
    }

    const comp = await db.competition.create({
      data: {
        name,
        slug,
        season,
        status: body.status ?? "DRAFT",
        format: body.format ?? "GROUPS_THEN_KNOCKOUT",
        rrType: body.rrType ?? "SINGLE",
        groupCount: Number(body.groupCount ?? 2),
        teamsPerGroup: Number(body.teamsPerGroup ?? 4),
        qualifiersPerGroup: Number(body.qualifiersPerGroup ?? 2),
        hasThirdPlaceMatch: Boolean(body.hasThirdPlaceMatch ?? false),
        hasKnockoutPhase: body.hasKnockoutPhase !== undefined
          ? Boolean(body.hasKnockoutPhase)
          : true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      include: { groups: true },
    });

    // Auto-create groups A, B, C...
    const groupCount = comp.groupCount;
    const groups = [];
    for (let i = 0; i < groupCount; i++) {
      groups.push({
        competitionId: comp.id,
        name: String.fromCharCode(65 + i),
      });
    }
    if (groups.length > 0) {
      await db.group.createMany({ data: groups });
    }

    const final = await db.competition.findUnique({
      where: { id: comp.id },
      include: { groups: true },
    });

    return NextResponse.json({ competition: final }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

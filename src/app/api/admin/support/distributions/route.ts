// POST /api/admin/support/distributions — create a distribution batch (PRESIDENT/DIRECTOR only)
// GET /api/admin/support/distributions — list all distributions

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageDistributions } from "@/lib/auth/permissions";
import { createDistribution, getDistributionHistory } from "@/lib/support/distribution-engine";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageDistributions(role)) {
    return NextResponse.json({ error: "Sèlman administratè ka kreye distribisyon." }, { status: 403 });
  }

  const body = await req.json();
  const { teamId } = body;
  if (!teamId) return NextResponse.json({ error: "teamId nesesè." }, { status: 400 });

  const result = await createDistribution({ teamId, createdBy: role });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageDistributions(role)) {
    return NextResponse.json({ error: "Sèlman administratè ka wè distribisyon." }, { status: 403 });
  }

  const distributions = await db.teamSupportDistribution.findMany({
    include: { team: true, allocations: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ distributions });
}

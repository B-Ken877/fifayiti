// POST /api/admin/support/distributions/[id]/execute — execute a distribution atomically.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageDistributions } from "@/lib/auth/permissions";
import { executeDistribution } from "@/lib/support/distribution-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageDistributions(role)) {
    return NextResponse.json({ error: "Sèlman administratè ka egzekite distribisyon." }, { status: 403 });
  }

  const { id } = await params;
  const result = await executeDistribution(id, role);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json(result);
}

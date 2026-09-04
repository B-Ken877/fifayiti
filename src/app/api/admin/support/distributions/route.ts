// POST /api/admin/support/distributions — create a distribution batch (PRESIDENT/DIRECTOR only)
// GET /api/admin/support/distributions — list all distributions

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageDistributions } from "@/lib/auth/permissions";
import { createDistribution } from "@/lib/support/distribution-engine";
import { db } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth/secret";
import { logBettingAction } from "@/lib/betting/audit";

const COOKIE_NAME = "fifayiti-session";

// P1 #7: extract the admin user ID from the signed session cookie
// (not just the role string — for real audit trail).
function getAdminUserId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expectedMac = createHmac("sha256", getAuthSecret()).update(body).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expectedMac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    // The admin session stores role + email. Use email as the actor ID
    // (it uniquely identifies which admin account performed the action).
    return payload?.email ?? payload?.role ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageDistributions(role)) {
    return NextResponse.json({ error: "Sèlman administratè ka kreye distribisyon." }, { status: 403 });
  }

  const body = await req.json();
  const { teamId } = body;
  if (!teamId) return NextResponse.json({ error: "teamId nesesè." }, { status: 400 });

  // P1 #7: use the admin's email (unique identifier) not the role string.
  const actorId = getAdminUserId(req.headers.get("cookie")) ?? role;

  const result = await createDistribution({ teamId, createdBy: actorId });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  await logBettingAction({
    actorType: "admin",
    actorId,
    action: "support.distribution.create",
    targetType: "team_support_distribution",
    targetId: result.distributionId,
    afterState: { teamId, batchNumber: result.batchNumber, totalAmount: result.totalAmount },
  });

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

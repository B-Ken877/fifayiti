// POST /api/admin/support/distributions/[id]/execute — execute a distribution atomically.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { canManageDistributions } from "@/lib/auth/permissions";
import { executeDistribution } from "@/lib/support/distribution-engine";
import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth/secret";
import { logBettingAction } from "@/lib/betting/audit";

const COOKIE_NAME = "fifayiti-session";

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
    return payload?.email ?? payload?.role ?? null;
  } catch {
    return null;
  }
}

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
  const actorId = getAdminUserId(req.headers.get("cookie")) ?? role;

  const result = await executeDistribution(id, actorId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  await logBettingAction({
    actorType: "admin",
    actorId,
    action: "support.distribution.execute",
    targetType: "team_support_distribution",
    targetId: id,
  });

  return NextResponse.json(result);
}

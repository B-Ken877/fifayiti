// GET /api/teams/[id]/support — public team support stats (total, supporters, recent donations)
// POST /api/teams/[id]/support/initiate — initiate a donation (creates PaymentIntent)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTeamSupportStats, initiateDonation } from "@/lib/support/donation-service";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const team = await db.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Ekip sa a pa egziste." }, { status: 404 });

  const stats = await getTeamSupportStats(id);
  return NextResponse.json({ team: { id: team.id, name: team.name, shortName: team.shortName }, ...stats });
}

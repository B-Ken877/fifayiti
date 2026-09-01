// GET /api/betting/stake-pools
// Returns the enabled stake pool options (for the bettor UI).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const pools = await db.stakePool.findMany({
    where: { enabled: true },
    orderBy: { displayOrder: "asc" },
  });
  return NextResponse.json({
    pools: pools.map((p) => ({
      id: p.id,
      amountCentimes: p.amountCentimes.toString(),
      label: p.label,
    })),
  });
}

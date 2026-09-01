// GET /api/betting/wallet/transactions
// Returns the bettor's ledger entries (transaction history).

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { db } from "@/lib/db";
import { formatHtg } from "@/lib/betting/types";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const entries = await db.ledgerEntry.findMany({
    where: { bettorId: bettor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    transactions: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amountCentimes.toString(),
      balanceAfter: e.balanceAfterCentimes.toString(),
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

// GET /api/betting/wallet/transactions
// A bettor-facing statement from the canonical ledger. Only movements in the
// bettor's available balance appear here; reserve-to-custody moves are not
// counted a second time after the original reservation.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const entries = await db.accountEntry.findMany({
    where: {
      account: { bettorId: bettor.id, type: "bettor_available" },
    },
    include: { transaction: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    transactions: entries.map((entry) => ({
      id: entry.transactionId,
      type: entry.transaction.type === "BET_SETTLEMENT" ? "BET_SETTLE_WIN" : entry.transaction.type,
      amount: (entry.direction === "credit" ? entry.amountCentimes : -entry.amountCentimes).toString(),
      balanceAfter: "",
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}

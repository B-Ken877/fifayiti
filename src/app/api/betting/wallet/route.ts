// GET /api/betting/wallet
// Returns the current bettor's wallet balances.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { getWallet } from "@/lib/betting/wallet";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const wallet = await getWallet(bettor.id);
  if (!wallet) {
    return NextResponse.json({ available: "0", reserved: "0", total: "0" });
  }

  return NextResponse.json({
    available: wallet.availableCentimes.toString(),
    reserved: wallet.reservedCentimes.toString(),
    total: (wallet.availableCentimes + wallet.reservedCentimes).toString(),
  });
}

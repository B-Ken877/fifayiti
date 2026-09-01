// POST /api/betting/wallet/deposit
// Demo deposit (admin/bettor self-service for testing).
// ⚠️ Real payment integration (MonCash/Natcash) is NOT wired — this is
//    a testing endpoint that creates a ledger DEPOSIT entry.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { deposit } from "@/lib/betting/wallet";
import { logBettingAction } from "@/lib/betting/audit";

export async function POST(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const body = await req.json();
  const amountCentimes = BigInt(body.amountCentimes ?? 0);
  if (amountCentimes <= 0n || amountCentimes > 1_000_000n) {
    return NextResponse.json({ error: "Montan pa valid." }, { status: 400 });
  }

  await deposit(bettor.id, amountCentimes, `demo-${Date.now()}`);

  await logBettingAction({
    actorType: "system",
    actorId: bettor.id,
    action: "wallet.deposit",
    targetType: "wallet",
    targetId: bettor.id,
    bettorId: bettor.id,
    afterState: { amount: amountCentimes.toString() },
  });

  return NextResponse.json({ ok: true, deposited: amountCentimes.toString() });
}

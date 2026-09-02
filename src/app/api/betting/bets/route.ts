// GET /api/betting/bets — list the bettor's bets.
// POST /api/betting/bets — place a new bet.
//
// POST is the critical bet-placement endpoint. It:
//   1. Authenticates the bettor (401 if not logged in).
//   2. Validates the market is OPEN + the selection belongs to it.
//   3. Validates the stake is an enabled stake pool (no arbitrary amounts).
//   4. Rate-limits: 20 bets/min per bettor.
//   5. Reserves funds + creates the BetOrder atomically (double-spend safe).
//   6. Tries to match immediately against opposing OPEN orders (exact stake).
//   7. Idempotency: an idempotencyKey prevents duplicate submissions.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { db } from "@/lib/db";
import { reserveForBet } from "@/lib/betting/wallet";
import { tryMatch } from "@/lib/betting/matching-engine";
import { pushMarketState, broadcastBetMatch } from "@/lib/betting/market-state";
import { logBettingAction } from "@/lib/betting/audit";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  const bets = await db.betOrder.findMany({
    where: { bettorId: bettor.id },
    include: {
      market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
      selection: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    bets: bets.map((b) => ({
      id: b.id,
      marketId: b.marketId,
      marketQuestion: b.market.question,
      marketStatus: b.market.status,
      selectionKey: b.selection.key,
      selectionLabel: b.selection.label,
      stakeCentimes: b.stakeCentimes.toString(),
      status: b.status,
      matchedAt: b.matchedAt?.toISOString() ?? null,
      settledAt: b.settledAt?.toISOString() ?? null,
      settleOutcome: b.settleOutcome,
      payoutCentimes: b.payoutCentimes?.toString() ?? null,
      matchHome: b.market.match?.homeTeam?.shortName,
      matchAway: b.market.match?.awayTeam?.shortName,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));
  if (!bettor) {
    return NextResponse.json({ error: "Ou pa konekte." }, { status: 401 });
  }

  // Rate limit: 20 bets/min per bettor.
  const rl = rateLimit("bet_place", bettor.id, LIMITS.BET_PLACE.limit, LIMITS.BET_PLACE.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann pariyaj. Eseye ankò pita." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { marketId, selectionId, stakeCentimes: stakeStr, idempotencyKey } = body;
    const stakeCentimes = BigInt(stakeStr ?? 0);

    if (!marketId || !selectionId || stakeCentimes <= 0n) {
      return NextResponse.json({ error: "Done pariyaj la pa konplè." }, { status: 400 });
    }

    // Idempotency: if the client sent a key, check for an existing bet.
    if (idempotencyKey) {
      const existing = await db.betOrder.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return NextResponse.json({
          ok: true, betId: existing.id, status: existing.status, idempotent: true,
        });
      }
    }

    // Validate the market is OPEN.
    const market = await db.bettingMarket.findUnique({
      where: { id: marketId },
      include: { selections: true },
    });
    if (!market || market.status !== "OPEN") {
      return NextResponse.json({ error: "Mache a pa louvri pou pariyaj." }, { status: 409 });
    }

    // Validate the selection belongs to the market.
    const selection = market.selections.find((s) => s.id === selectionId);
    if (!selection) {
      return NextResponse.json({ error: "Seleksyon sa a pa nan mache a." }, { status: 400 });
    }

    // Validate the stake is an enabled pool (no arbitrary amounts).
    const pool = await db.stakePool.findFirst({
      where: { amountCentimes: stakeCentimes, enabled: true },
    });
    if (!pool) {
      return NextResponse.json({ error: "Montan sa a pa pèmèt." }, { status: 400 });
    }

    // Atomic: reserve funds + create the bet.
    const betOrder = await db.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { bettorId: bettor.id } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { bettorId: bettor.id } });
      }
      if (wallet.availableCentimes < stakeCentimes) {
        throw new Error("Solde disponib ou pa ase.");
      }

      const bet = await tx.betOrder.create({
        data: {
          bettorId: bettor.id,
          marketId,
          selectionId,
          stakeCentimes,
          status: "OPEN",
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      await tx.wallet.update({
        where: { bettorId: bettor.id },
        data: {
          availableCentimes: wallet.availableCentimes - stakeCentimes,
          reservedCentimes: wallet.reservedCentimes + stakeCentimes,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          bettorId: bettor.id,
          amountCentimes: -stakeCentimes,
          type: "BET_RESERVE",
          referenceType: "bet_order",
          referenceId: bet.id,
          balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes,
          metadata: JSON.stringify({ action: "reserve", betOrderId: bet.id, marketId, selectionId }),
        },
      });

      return bet;
    });

    await logBettingAction({
      actorType: "system",
      actorId: bettor.id,
      action: "bet.place",
      targetType: "bet_order",
      targetId: betOrder.id,
      bettorId: bettor.id,
      afterState: { marketId, selectionId, stake: stakeCentimes.toString() },
    });

    // Try to match immediately.
    const matchResult = await tryMatch(betOrder.id);

    if (matchResult.matched) {
      await broadcastBetMatch(bettor.id, betOrder.id, marketId);
      await pushMarketState(marketId);
    }

    return NextResponse.json({
      ok: true,
      betId: betOrder.id,
      matched: matchResult.matched,
      status: matchResult.matched ? "MATCHED" : "OPEN",
      message: matchResult.matched
        ? "Paryaj ou a jwenn!"
        : "N ap chèche yon parye opoze pou ou...",
    });
  } catch (e: any) {
    const msg = e?.message ?? "Erè sèvè.";
    if (msg.includes("Solde disponib")) {
      return NextResponse.json({ error: "Solde disponib ou pa ase." }, { status: 402 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

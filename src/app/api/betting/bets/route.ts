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
  const rl = await rateLimit("bet_place", bettor.id, LIMITS.BET_PLACE.limit, LIMITS.BET_PLACE.windowMs);
  if (!rl.available) return NextResponse.json({ error: "Sèvis la pa disponib kounye a." }, { status: 503 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann pariyaj. Eseye ankò pita." }, { status: 429 });
  }

  try {
    if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024) {
      return NextResponse.json({ error: "Demann lan twò gwo." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Done pariyaj la pa valid." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Done pariyaj la pa valid." }, { status: 400 });
    }
    const { marketId, selectionId, stakeCentimes: stakeStr, idempotencyKey } = body as Record<string, unknown>;
    if (
      typeof marketId !== "string" || typeof selectionId !== "string" ||
      typeof stakeStr !== "string" || !/^\d{1,12}$/.test(stakeStr) ||
      typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128
    ) {
      return NextResponse.json({ error: "Done pariyaj la pa valid." }, { status: 400 });
    }
    const stakeCentimes = BigInt(stakeStr);

    if (stakeCentimes <= 0n) {
      return NextResponse.json({ error: "Done pariyaj la pa konplè." }, { status: 400 });
    }

    // Idempotency: if the client sent a key, check for an existing bet.
    if (idempotencyKey) {
      const existing = await db.betOrder.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          existing.bettorId !== bettor.id || existing.marketId !== marketId ||
          existing.selectionId !== selectionId || existing.stakeCentimes !== stakeCentimes
        ) {
          return NextResponse.json({ error: "Kle idempotans sa a deja sèvi." }, { status: 409 });
        }
        return NextResponse.json({
          ok: true, betId: existing.id, status: existing.status, idempotent: true,
        });
      }
    }

    let betOrder;
    try {
      betOrder = await db.$transaction(async (tx) => {
        const market = await tx.bettingMarket.findUnique({
          where: { id: marketId },
          include: { selections: true },
        });
        if (!market || market.status !== "OPEN") {
          throw Object.assign(new Error("MARKET_CLOSED"), { statusCode: 409 });
        }
        const lockedMarket = await tx.bettingMarket.updateMany({
          where: { id: marketId, status: "OPEN" },
          data: { status: "OPEN" },
        });
        if (lockedMarket.count !== 1) {
          throw Object.assign(new Error("MARKET_CLOSED"), { statusCode: 409 });
        }
        if (!market.selections.some((s) => s.id === selectionId)) {
          throw Object.assign(new Error("INVALID_SELECTION"), { statusCode: 400 });
        }
        const pool = await tx.stakePool.findFirst({
          where: { amountCentimes: stakeCentimes, enabled: true },
        });
        if (!pool) throw Object.assign(new Error("INVALID_STAKE"), { statusCode: 400 });

        const created = await tx.betOrder.create({
          data: { bettorId: bettor.id, marketId, selectionId, stakeCentimes, status: "OPEN", idempotencyKey },
        });
        await reserveForBet(bettor.id, stakeCentimes, created.id, tx);
        return created;
      });
    } catch (e: any) {
      if (String(e?.code ?? "").includes("P2002") && idempotencyKey) {
        const existing = await db.betOrder.findUnique({ where: { idempotencyKey } });
        if (existing?.bettorId === bettor.id && existing.marketId === marketId &&
            existing.selectionId === selectionId && existing.stakeCentimes === stakeCentimes) {
          return NextResponse.json({ ok: true, betId: existing.id, status: existing.status, idempotent: true });
        }
        return NextResponse.json({ error: "Kle idempotans sa a deja sèvi." }, { status: 409 });
      }
      if (e?.statusCode) {
        const errors: Record<number, string> = {
          400: e.message === "INVALID_SELECTION" ? "Seleksyon sa a pa nan mache a." : "Montan sa a pa pèmèt.",
          409: "Mache a pa louvri pou pariyaj.",
        };
        return NextResponse.json({ error: errors[e.statusCode] }, { status: e.statusCode });
      }
      const msg = e?.message ?? "";
      if (msg.includes("Solde disponib") || msg.includes("Insufficient")) {
        return NextResponse.json({ error: "Solde disponib ou pa ase." }, { status: 402 });
      }
      console.error("[betting/bets] placement failed:", msg);
      return NextResponse.json({ error: "Erè sèvè." }, { status: 500 });
    }

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
    const msg = e?.message ?? "";
    if (msg.includes("Solde disponib")) {
      return NextResponse.json({ error: "Solde disponib ou pa ase." }, { status: 402 });
    }
    console.error("[betting/bets] request failed:", msg);
    return NextResponse.json({ error: "Erè sèvè." }, { status: 500 });
  }
}

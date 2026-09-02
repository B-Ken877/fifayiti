// POST /api/betting/markets
// Create a new market from a template. Betting operator only.
// Body: { matchId, templateCode, config? }
// Enforces: ONE active market per match (rejects if one exists).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionRole } from "@/lib/auth/session";
import { hasActiveMarket } from "@/lib/betting/market-state";
import { logBettingAction } from "@/lib/betting/audit";
import { MARKET_TEMPLATES } from "@/lib/betting/types";
import { canManageBettingMarkets } from "@/lib/auth/permissions";
import { createMarketAtomic } from "@/lib/betting/market-state";
import { rateLimit, LIMITS, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Auth: BETTING_OPERATOR ONLY (spec Part 4). PRESIDENT/DIRECTOR cannot
  // publish markets — they can only trigger emergency betting suspension.
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) {
    return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  }
  if (!canManageBettingMarkets(role)) {
    return NextResponse.json(
      { error: "Sèlman operatè pariaj ka kreye mache." },
      { status: 403 },
    );
  }

  // Rate limit.
  const rl = rateLimit("market_create", role, LIMITS.MARKET_PUB.limit, LIMITS.MARKET_PUB.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { matchId, templateCode, config } = body;
    if (!matchId || !templateCode) {
      return NextResponse.json({ error: "matchId ak templateCode nesesè." }, { status: 400 });
    }

    // Validate the template.
    const template = await db.marketTemplate.findUnique({ where: { code: templateCode } });
    if (!template || !template.enabled) {
      return NextResponse.json({ error: "Modèl mache sa a pa disponib." }, { status: 400 });
    }

    // Validate the match.
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      return NextResponse.json({ error: "Match sa a pa egziste." }, { status: 404 });
    }

    // Build selections based on the template mode.
    const configObj = config ?? {};
    let selections: { key: string; label: string; order: number }[] = [];
    if (template.selectionMode === "TWO_TEAM") {
      selections = [
        { key: "HOME", label: match.homeTeam?.shortName ?? "HOME", order: 0 },
        { key: "AWAY", label: match.awayTeam?.shortName ?? "AWAY", order: 1 },
      ];
    } else if (template.selectionMode === "YES_NO") {
      selections = [
        { key: "YES", label: "Wi", order: 0 },
        { key: "NO", label: "Non", order: 1 },
      ];
    } else if (template.selectionMode === "OVER_UNDER") {
      const threshold = configObj.threshold ?? 2;
      selections = [
        { key: "OVER", label: `Plis pase ${threshold}`, order: 0 },
        { key: "UNDER", label: `Mwens oswa egal ${threshold}`, order: 1 },
      ];
    }

    // For ANOTHER_GOAL, snapshot the current goals at market open.
    if (templateCode === "ANOTHER_GOAL") {
      configObj.goalsAtMarketOpen = (match.homeScore ?? 0) + (match.awayScore ?? 0);
    }

    // ATOMIC one-active-market enforcement (spec P0.5):
    // check + create happen inside a single transaction. On PostgreSQL a
    // partial unique index backs this; on SQLite the in-tx re-count
    // approximates it. Concurrent create attempts → one wins, one gets
    // { ok: false, reason: "active market exists" }.
    const result = await createMarketAtomic({
      matchId,
      templateId: template.id,
      question: template.label,
      config: JSON.stringify(configObj),
      selections,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Gen yon mache ki deja aktif pou match sa a. Fèmen li anvan ou kreye yon lòt." },
        { status: 409 },
      );
    }

    const market = result.market!;

    await logBettingAction({
      actorType: "betting_operator",
      actorId: role,
      action: "market.create",
      targetType: "market",
      targetId: market.id,
      afterState: { status: "DRAFT", templateCode, matchId },
    });

    return NextResponse.json({
      ok: true,
      marketId: market.id,
      status: "DRAFT",
      message: "Mache kreye. Klike 'Pibliye' pou louvri li pou pariyaj.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

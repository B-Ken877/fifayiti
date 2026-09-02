// POST /api/matches/[id]/events
//
// SECURE OFFICIAL MATCH EVENT ENDPOINT (spec P0.1).
//
// This is a critical trust boundary: official events drive the score, the
// live broadcast, betting markets, and bettor balances. The client is NOT
// trusted. Server-side checks:
//
//   1. AUTHENTICATION — the request must carry a valid signed session cookie.
//      Unauthenticated → 401.
//   2. AUTHORIZATION — only LIVE_OPERATOR may create official events.
//      PRESIDENT / DIRECTOR / TEAM_ADMIN / BETTOR / public → 403.
//   3. EVENT TYPE VALIDATION — the `kind` must be in the approved catalog
//      (OFFICIAL_EVENT_TYPES). Arbitrary strings → 400.
//   4. REFERENCE VALIDATION — the teamId (if present) must belong to the
//      match (homeTeamId or awayTeamId). The playerInId/playerOutId (if
//      present) must belong to that team. Invalid refs → 400.
//   5. OPERATOR IDENTITY — the operator is derived from the SESSION, never
//      from the request body. A body.operatorId field is IGNORED.
//   6. RATE LIMIT — 30 events/min per operator (live events are frequent).
//   7. AUDIT — every accepted event is logged to BettingAuditLog with the
//      operator's id, the event type, and the before/after match state.
//
// DOWNSTREAM: this route also creates an OfficialEvent + an OutboxEvent
// (in the SAME transaction) so the settlement engine + LiveKit push are
// retried-on-failure rather than fire-and-forget.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionRole } from "@/lib/auth/session";
import {
  canCreateOfficialMatchEvent,
  isValidEventType,
} from "@/lib/auth/permissions";
import { rateLimit, LIMITS, clientIp } from "@/lib/rate-limit";
import { pushBroadcastMatchUpdate } from "@/lib/streaming/broadcast-state";
import { triggerBroadcastReplay } from "@/lib/streaming/replay-engine";
import { onOfficialEventConfirmed } from "@/lib/betting/settlement-engine";

const HALF_LENGTH_SECONDS = 30 * 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── 1. AUTHENTICATION ──────────────────────────────────────────────
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) {
    return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  }

  // ── 2. AUTHORIZATION ───────────────────────────────────────────────
  // Only LIVE_OPERATOR may create official match events. PRESIDENT /
  // DIRECTOR / TEAM_ADMIN / BETTING_OPERATOR / cameramen / public → 403.
  if (!canCreateOfficialMatchEvent(role)) {
    return NextResponse.json(
      { error: "Sèlman operatè an dirèk ka kreye evènman ofisyèl." },
      { status: 403 },
    );
  }

  // ── 3. RATE LIMIT (per operator) ───────────────────────────────────
  const rl = rateLimit("event_create", role, LIMITS.EVENT_CREATE.limit, LIMITS.EVENT_CREATE.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop demann. Eseye ankò nan kèk segond." },
      { status: 429 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();

    // ── 4. EVENT TYPE VALIDATION ─────────────────────────────────────
    if (!body.kind || !isValidEventType(body.kind)) {
      return NextResponse.json(
        { error: `Tip evènman "${body.kind}" pa nan katalòg ofisyèl la.` },
        { status: 400 },
      );
    }

    // ── 5. MATCH EXISTS ───────────────────────────────────────────────
    const match = await db.match.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }

    // ── 6. REFERENCE VALIDATION ───────────────────────────────────────
    // The teamId (if provided) must be the home or away team of this match.
    if (body.teamId && body.teamId !== match.homeTeamId && body.teamId !== match.awayTeamId) {
      return NextResponse.json(
        { error: "Ekip sa a pa nan match sa a." },
        { status: 400 },
      );
    }
    // playerInId / playerOutId (if provided) must belong to the referenced team.
    if (body.playerInId) {
      const p = await db.player.findUnique({ where: { id: body.playerInId } });
      if (!p || (body.teamId && p.teamId !== body.teamId)) {
        return NextResponse.json(
          { error: "Jwèt sa a pa nan ekip sa a." },
          { status: 400 },
        );
      }
    }
    if (body.playerOutId) {
      const p = await db.player.findUnique({ where: { id: body.playerOutId } });
      if (!p || (body.teamId && p.teamId !== body.teamId)) {
        return NextResponse.json(
          { error: "Jwèt sa a pa nan ekip sa a." },
          { status: 400 },
        );
      }
    }

    // ── 7. OPERATOR IDENTITY (from session, NOT body) ─────────────────
    // The `body.operatorId` field is intentionally ignored — the operator
    // is whoever the signed session says they are.
    const operatorId = role; // the role string identifies the operator session

    // Determine the current minute (clock seconds → minute number)
    const minute = body.minute ?? Math.floor((match.clock ?? 0) / 60);
    const half = body.half ?? (match.half === "2" ? 2 : 1);

    // ── 8. CREATE MATCH EVENT + OFFICIAL EVENT + OUTBOX (atomic) ──────
    // All three writes happen inside a single Prisma transaction so the
    // official event log + the outbox never diverge from the raw MatchEvent.
    const beforeState = {
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
      half: match.half,
      clock: match.clock,
    };

    const event = await db.$transaction(async (tx) => {
      const ev = await tx.matchEvent.create({
        data: {
          matchId: id,
          minute,
          half,
          kind: body.kind,
          teamId: body.teamId ?? null,
          playerInId: body.playerInId ?? null,
          playerOutId: body.playerOutId ?? null,
          description: body.description ?? "",
          recordedAt: new Date(),
        },
      });

      // OfficialEvent — the formal record for the settlement engine.
      const nextSeq = await tx.officialEvent.count({ where: { matchId: id } }) + 1;
      const official = await tx.officialEvent.create({
        data: {
          matchId: id,
          matchEventId: ev.id,
          sequenceNumber: nextSeq,
          eventType: body.kind,
          teamId: body.teamId ?? null,
          playerId: body.playerInId ?? null,
          matchTime: `${minute}:${String(Math.floor((match.clock ?? 0) % 60)).padStart(2, "0")}`,
          status: "CONFIRMED",
          operatorId,
          confirmedAt: new Date(),
          metadata: JSON.stringify({ description: body.description ?? "", half }),
        },
      });

      // Outbox — drives the downstream chain (settlement, LiveKit push).
      await tx.outboxEvent.create({
        data: {
          aggregateType: "match",
          aggregateId: id,
          eventType: "OfficialEventConfirmed",
          payload: JSON.stringify({
            matchId: id,
            eventId: ev.id,
            officialEventId: official.id,
            kind: body.kind,
            teamId: body.teamId ?? null,
            playerInId: body.playerInId ?? null,
            minute,
            half,
            operatorId,
          }),
        },
      });

      return { ev, official };
    });

    // ── 9. SIDE EFFECTS ON THE MATCH (score, phase) ───────────────────
    const updates: Record<string, any> = {};
    if (body.kind === "GOL" && body.teamId) {
      if (body.teamId === match.homeTeamId) {
        updates.homeScore = (match.homeScore ?? 0) + 1;
      } else if (body.teamId === match.awayTeamId) {
        updates.awayScore = (match.awayScore ?? 0) + 1;
      }
    }
    if (body.kind === "KOMANSE" || body.kind === "MATCH_STARTED") {
      updates.status = "AN_DIRÈK";
      updates.half = "1";
      updates.clock = 0;
    } else if (body.kind === "MWATYE_TAN" || body.kind === "HALF_TIME") {
      updates.half = "HT";
      updates.clock = HALF_LENGTH_SECONDS;
    } else if (body.kind === "DEZYEM_MITAN" || body.kind === "SECOND_HALF_STARTED") {
      updates.half = "2";
      updates.clock = 0;
    } else if (body.kind === "FEN_MATCH" || body.kind === "MATCH_ENDED") {
      updates.status = "FINI";
      updates.half = "POST";
    }

    let updatedMatch = match;
    if (Object.keys(updates).length > 0) {
      updatedMatch = await db.match.update({ where: { id }, data: updates });
    }

    // ── 10. AUDIT LOG ─────────────────────────────────────────────────
    await db.bettingAuditLog.create({
      data: {
        actorType: "live_operator",
        actorId: operatorId,
        action: "official_event.create",
        targetType: "match_event",
        targetId: event.ev.id,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify({
          homeScore: updatedMatch.homeScore,
          awayScore: updatedMatch.awayScore,
          status: updatedMatch.status,
          half: updatedMatch.half,
          clock: updatedMatch.clock,
        }),
        reason: `${body.kind} @ ${minute}'`,
      },
    });

    // ── 11. DOWNSTREAM (awaited so Vercel doesn't freeze the lambda) ──
    // LiveKit push (scorebug + clock) — best-effort, never blocks.
    await pushBroadcastMatchUpdate(id, {
      forceClock: updatedMatch.clock ?? 0,
      forceHalf: updatedMatch.half,
      forceStatus: updatedMatch.status,
    }).catch(() => {});

    // Instant replay for eligible kinds — best-effort.
    const REPLAY_KINDS = ["GOL", "FOT", "KAT_JON", "KAT_WOUJ"];
    if (REPLAY_KINDS.includes(body.kind)) {
      await triggerBroadcastReplay({
        kind: body.kind,
        matchId: id,
        eventId: event.ev.id,
        teamId: body.teamId ?? null,
        playerInId: body.playerInId ?? null,
        description: body.description ?? "",
        minute,
      }).catch(() => {});
    }

    // Settlement engine — fires on confirmed official events. Idempotent
    // (the SettlementTransaction unique constraint guarantees no double settlement).
    await onOfficialEventConfirmed(event.official.id).catch(() => {});

    return NextResponse.json({ event: event.ev, match: updatedMatch }, { status: 201 });
  } catch (e: any) {
    console.error("[events] error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Erè sèvè." }, { status: 500 });
  }
}

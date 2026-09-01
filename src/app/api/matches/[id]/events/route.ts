import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import path from "path";
import { triggerBroadcastReplay } from "@/lib/streaming/replay-engine";
import { pushBroadcastMatchUpdate } from "@/lib/streaming/broadcast-state";
import { onOfficialEventConfirmed } from "@/lib/betting/settlement-engine";

/**
 * POST /api/matches/[id]/events
 *
 * Body: { kind, teamId?, playerInId?, playerOutId?, description?, minute?, half? }
 *
 * If kind === "GOL", the corresponding team's score is incremented.
 * If kind === "KAT_WOUJ" or "KAT_JON" or "RANPLASMAN", only the event is recorded.
 */

const HALF_LENGTH_SECONDS = 30 * 60; // 30 minutes per half

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.kind) {
      return NextResponse.json({ error: "kind is required" }, { status: 400 });
    }
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }

    // Determine the current minute (clock seconds → minute number)
    const minute = body.minute ?? Math.floor((match.clock ?? 0) / 60);
    const half = body.half ?? (match.half === "2" ? 2 : 1);

    const event = await db.matchEvent.create({
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

    // Side-effects on the match itself
    const updates: Record<string, any> = {};
    if (body.kind === "GOL" && body.teamId) {
      if (body.teamId === match.homeTeamId) {
        updates.homeScore = (match.homeScore ?? 0) + 1;
      } else if (body.teamId === match.awayTeamId) {
        updates.awayScore = (match.awayScore ?? 0) + 1;
      }
    }
    if (body.kind === "KOMANSE") {
      updates.status = "AN_DIRÈK";
      updates.half = "1";
      updates.clock = 0;
    } else if (body.kind === "MWATYE_TAN") {
      updates.half = "HT";
      updates.clock = HALF_LENGTH_SECONDS;
    } else if (body.kind === "DEZYEM_MITAN") {
      updates.half = "2";
      updates.clock = 0;
    } else if (body.kind === "FEN_MATCH") {
      updates.status = "FINI";
      updates.half = "POST";
    }

    let updatedMatch = match;
    if (Object.keys(updates).length > 0) {
      updatedMatch = await db.match.update({ where: { id }, data: updates });
    }

    // ── BROADCAST OVERLAY + INSTANT REPLAY (Tasks 17-18) ──────────────
    // Every operator event pushes a broadcast overlay (animated visual for
    // viewers) and, for replay-eligible kinds (GOL, FOT, KAT_JON, KAT_WOUJ),
    // fires the instant replay engine. Both are fire-and-forget: failures
    // NEVER affect the event or the live broadcast.
    const REPLAY_KINDS = ["GOL", "FOT", "KAT_JON", "KAT_WOUJ"];

    // Build the overlay event for viewers
    const overlayEvent: any = {
      id: event.id,
      kind: body.kind,
      teamShort: undefined, // resolved from team lookup below
      teamColor: undefined,
      playerInName: body.playerInId ? undefined : undefined, // resolved by player lookup
      playerOutName: undefined,
      minute,
      half,
      createdAt: Date.now(),
    };

    // Resolve team + player names for the overlay (best-effort, non-blocking)
    try {
      if (body.teamId) {
        const team = await db.team.findUnique({ where: { id: body.teamId } });
        if (team) {
          overlayEvent.teamShort = team.shortName;
          overlayEvent.teamColor = team.primaryColor;
        }
      }
      if (body.playerInId) {
        const pIn = await db.player.findUnique({ where: { id: body.playerInId } });
        if (pIn) overlayEvent.playerInName = `${pIn.firstName} ${pIn.lastName}`;
      }
      if (body.playerOutId) {
        const pOut = await db.player.findUnique({ where: { id: body.playerOutId } });
        if (pOut) overlayEvent.playerOutName = `${pOut.firstName} ${pOut.lastName}`;
      }
    } catch {}

    // ── PUSH TO THE BROADCAST ROOM (the TV's data source) ────────────
    // The TV scorebug polls the LiveKit room metadata every 2s. Pushing
    // the fresh score + overlay there is what makes the operator's work
    // appear on viewers' screens — works on Vercel AND the sandbox
    // (no local filesystem involved). Overlay lives IN the metadata so
    // the read-only serverless FS can no longer swallow it.
    //
    // AWAIT (not fire-and-forget): on Vercel serverless, the lambda is
    // frozen the moment the response is returned. A `void` push would be
    // killed before the LiveKit API call completes, so the TV would never
    // see the new score/overlay. Awaiting adds ~200ms to the response but
    // guarantees the metadata reaches LiveKit Cloud.
    //
    // SCORE DELTA (not DB read): on Vercel each lambda gets a fresh DB
    // copy. If we read the score from the DB, a clock tick on a different
    // lambda (which starts with the stale committed DB score=0) would
    // OVERWRITE this GOL. Instead we pass a scoreDelta — the push function
    // reads the CURRENT score from LiveKit metadata (shared across all
    // lambdas) and adds the delta. The GOL is never lost.
    const scoreDelta =
      body.kind === "GOL" && body.teamId === match.homeTeamId
        ? { home: 1, away: 0 }
        : body.kind === "GOL" && body.teamId === match.awayTeamId
        ? { home: 0, away: 1 }
        : undefined;

    // Phase-changing events also force-set the clock/half/status in the
    // LiveKit metadata (not just the DB — the DB is ephemeral on Vercel).
    const phaseOpts: any = {};
    if (body.kind === "KOMANSE") {
      phaseOpts.forceClock = 0;
      phaseOpts.forceHalf = "1";
      phaseOpts.forceStatus = "AN_DIRÈK";
    } else if (body.kind === "MWATYE_TAN") {
      phaseOpts.forceClock = HALF_LENGTH_SECONDS;
      phaseOpts.forceHalf = "HT";
    } else if (body.kind === "DEZYEM_MITAN") {
      phaseOpts.forceClock = 0;
      phaseOpts.forceHalf = "2";
      phaseOpts.forceStatus = "AN_DIRÈK";
    } else if (body.kind === "FEN_MATCH") {
      phaseOpts.forceHalf = "POST";
      phaseOpts.forceStatus = "FINI";
    }

    await pushBroadcastMatchUpdate(id, {
      overlay: overlayEvent,
      scoreDelta,
      ...phaseOpts,
    }).catch(() => {});

    // Best-effort local file copy (sandbox/standalone only — Vercel's FS
    // is read-only and silently skips this; the room metadata above is
    // the authoritative channel everywhere).
    try {
      const stateFile = path.join(
        process.cwd().replace(/\.next\/standalone$/, ""),
        "db",
        "broadcast-overlay.json"
      );
      const fs = await import("fs/promises");
      await fs.writeFile(stateFile, JSON.stringify({
        overlay: overlayEvent,
        savedAt: new Date().toISOString(),
      }, null, 2));
    } catch (e: any) {
      console.warn("[events] overlay write failed:", e?.message);
    }

    // Audit log (append-only)
    try {
      const auditFile = path.join(
        process.cwd().replace(/\.next\/standalone$/, ""),
        "db",
        "audit-log.jsonl"
      );
      const fs = await import("fs/promises");
      const entry = JSON.stringify({
        ts: new Date().toISOString(),
        action: "event_create",
        matchId: id,
        eventId: event.id,
        kind: body.kind,
        teamId: body.teamId ?? null,
        playerInId: body.playerInId ?? null,
        playerOutId: body.playerOutId ?? null,
        minute,
        half,
        description: body.description ?? "",
      }) + "\n";
      await fs.appendFile(auditFile, entry);
    } catch (e: any) {
      console.warn("[events] audit log failed:", e?.message);
    }

    // Instant replay for eligible kinds.
    // AWAIT (not fire-and-forget): the replay sends a LiveKit data-channel
    // message to every viewer — that network call must complete before the
    // lambda freezes, else no viewer sees the replay.
    if (REPLAY_KINDS.includes(body.kind)) {
      await triggerBroadcastReplay({
        kind: body.kind,
        matchId: id,
        eventId: event.id,
        teamId: body.teamId ?? null,
        playerInId: body.playerInId ?? null,
        description: body.description ?? "",
        minute,
      }).catch((err) => {
        console.error("[events] instant replay trigger failed:", err?.message ?? err);
      });
    }

    // ── FIFAYITI PARIAJ: create an OfficialEvent + trigger settlement ──
    // The betting settlement engine reads OfficialEvents (with sequence
    // numbers + PENDING/CONFIRMED/CANCELLED status). We create one here
    // (CONFIRMED — live operator events are confirmed on creation; a
    // future "correct event" flow will create a CANCELLED + supersession
    // chain) and fire the settlement engine to suspend + settle any
    // affected markets. Failures never break the event creation itself.
    try {
      const nextSeq = await db.officialEvent.count({ where: { matchId: id } }) + 1;
      const officialEvent = await db.officialEvent.create({
        data: {
          matchId: id,
          matchEventId: event.id,
          sequenceNumber: nextSeq,
          eventType: body.kind,
          teamId: body.teamId ?? null,
          playerId: body.playerInId ?? null,
          matchTime: `${minute}:${String(Math.floor((updatedMatch.clock ?? 0) % 60)).padStart(2, "0")}`,
          status: "CONFIRMED",
          operatorId: "live_operator",
          confirmedAt: new Date(),
          metadata: JSON.stringify({ description: body.description ?? "", half }),
        },
      });
      // Fire the settlement engine (awaits so the lambda doesn't freeze it).
      await onOfficialEventConfirmed(officialEvent.id).catch((err) => {
        console.warn("[events] settlement trigger failed:", err?.message);
      });
    } catch (e: any) {
      console.warn("[events] official event creation failed:", e?.message);
    }

    return NextResponse.json({ event, match: updatedMatch }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

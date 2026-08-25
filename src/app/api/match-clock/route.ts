// GET  /api/match-clock
//   Returns the authoritative match clock state (server-side computation).
//
// POST /api/match-clock
//   Body: { action, matchId?, stoppageSeconds? }
//   Actions: start | pause | resume_second_half | full_time | add_stoppage | reset
//   Auth: requires live_operator/president/director role.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { getLiveClock, applyClockAction } from "@/lib/streaming/match-clock";

export async function GET() {
  try {
    const clock = await getLiveClock();
    return NextResponse.json(clock);
  } catch (e: any) {
    return NextResponse.json({
      seconds: 0,
      formatted: "0:00",
      minute: "0'",
      half: "PRE",
      running: false,
      stoppageSeconds: 0,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const role = getSessionRole(req.headers.get("cookie"));
    const allowed = ["live_operator", "president", "director"];
    if (!role || !allowed.includes(role)) {
      return NextResponse.json(
        { error: "Ou pa gen dwa pou kontwole montre la." },
        { status: 403 }
      );
    }
    const body = await req.json();
    const state = await applyClockAction(
      body.action,
      body.matchId,
      body.stoppageSeconds
    );
    return NextResponse.json({ ok: true, state });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

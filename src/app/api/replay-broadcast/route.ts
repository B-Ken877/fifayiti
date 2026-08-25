// GET /api/replay-broadcast
//
// Viewer-facing active broadcast-replay state. The TV/home players poll
// this every 2s while live. When { active: true, url } the players (if at
// the live edge) switch to the replay playlist, play it through, and
// return to LIVE automatically.

import { NextResponse } from "next/server";
import { readBroadcastState } from "@/lib/streaming/replay-engine";

export async function GET() {
  try {
    const state = await readBroadcastState();
    return NextResponse.json(state);
  } catch (e: any) {
    // Never let replay problems affect the viewer.
    return NextResponse.json({
      active: false, url: null, kind: null, replayId: null,
      startedAt: null, endsAt: null, durationMs: null,
    });
  }
}

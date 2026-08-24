// GET  /api/livekit-hls  — viewer-facing HLS/DVR status:
//   { active, ready, url }   (ready = playlist on disk, player may attach)
//
// POST /api/livekit-hls  — manual override for staff:
//   body { action: "start" | "stop" }   requires live_operator/president/director
//
// Under normal operation the lifecycle is fully automatic: /api/livekit-room
// starts the egress when the operator puts a camera on air and stops it when
// the broadcast ends. This route exists for status polling and manual control.

import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth/session";
import { ensureHlsEgress, stopHlsEgress, getHlsStatus } from "@/lib/streaming/hls-egress";

export async function GET() {
  try {
    const status = await getHlsStatus();
    return NextResponse.json(status);
  } catch (e: any) {
    console.error("[livekit-hls] GET error:", e);
    return NextResponse.json({ active: false, ready: false, url: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const role = getSessionRole(req.headers.get("cookie"));
    const allowed = ["live_operator", "president", "director"];
    if (!role || !allowed.includes(role)) {
      return NextResponse.json(
        { error: "Ou pa gen dwa pou kontwole DVR a." },
        { status: 403 }
      );
    }
    const body = await req.json();
    if (body?.action === "start") {
      const st = await ensureHlsEgress();
      return NextResponse.json({ ok: true, ...st });
    }
    if (body?.action === "stop") {
      await stopHlsEgress();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action dwe 'start' oswa 'stop'" }, { status: 400 });
  } catch (e: any) {
    console.error("[livekit-hls] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

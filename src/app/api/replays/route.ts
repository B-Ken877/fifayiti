// GET /api/replays?matchId=...
//
// Lists instant-replay records (Prisma-backed; created live when the
// operator confirms a replay-eligible event). Each record carries the
// DVR timeline coordinates (triggeredAt + preRoll + slowMoRate) so a
// standalone clip can be materialized from the egress recording once
// object storage is configured — until then the broadcast replay itself
// is delivered live over the LiveKit data channel.

import { NextRequest, NextResponse } from "next/server";
import { listReplays } from "@/lib/streaming/replay-engine";

export async function GET(req: NextRequest) {
  try {
    const matchId = new URL(req.url).searchParams.get("matchId") ?? undefined;
    const replays = await listReplays(matchId || undefined);
    return NextResponse.json({ replays });
  } catch (e: any) {
    return NextResponse.json({ replays: [] });
  }
}

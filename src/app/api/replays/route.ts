// GET /api/replays?matchId=...
//
// Lists archived instant replays (metadata only — each record points at
// its standalone HLS clip under /replays/<id>/replay.m3u8).
// Powers the match's Replay section later:
//   Match
//    ├── ⚽ Goal 12'
//    ├── ⚽ Goal 37'
//    └── ...

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

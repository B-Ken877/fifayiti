import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushBroadcastMatchUpdate } from "@/lib/streaming/broadcast-state";

/**
 * POST /api/matches/[id]/phase
 *
 * Body: { action: "start" | "half_time" | "second_half" | "end" | "tick" }
 *
 *  - "start": set status=AN_DIRÈK, half="1", clock=0  (operator pressed "Kòmanse")
 *  - "half_time": set half="HT", clock=HALF_LENGTH  (operator pressed "Mwatye tan"
 *     OR the chronometer auto-stopped at 30:00)
 *  - "second_half": set half="2", clock=0  (operator pressed "Dezyèm mitan")
 *  - "end": set status=FINI, half="POST"
 *  - "tick": increment clock by 1 second; if first half reaches 30:00, auto-set
 *     half="HT"; if second half reaches 30:00, auto-set half="POST"
 */

const HALF_LENGTH_SECONDS = 30 * 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action: string = body.action;

    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    switch (action) {
      case "start":
        updates.status = "AN_DIRÈK";
        updates.half = "1";
        updates.clock = 0;
        break;
      case "half_time":
        updates.half = "HT";
        updates.clock = HALF_LENGTH_SECONDS;
        break;
      case "second_half":
        updates.half = "2";
        updates.clock = 0;
        break;
      case "end":
        updates.status = "FINI";
        updates.half = "POST";
        break;
      case "tick": {
        const newClock = (match.clock ?? 0) + 1;
        if (match.half === "1" && newClock >= HALF_LENGTH_SECONDS) {
          // Auto-stop at end of first half
          updates.clock = HALF_LENGTH_SECONDS;
          updates.half = "HT";
        } else if (match.half === "2" && newClock >= HALF_LENGTH_SECONDS) {
          // Auto-stop at end of second half
          updates.clock = HALF_LENGTH_SECONDS;
          updates.half = "POST";
          updates.status = "FINI";
        } else {
          updates.clock = newClock;
        }
        break;
      }
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }

    const updated = await db.match.update({ where: { id }, data: updates });

    // Push the fresh clock/phase to the broadcast room (the TV's data
    // source). The payload carries clockEpoch + running so GET
    // /api/livekit-room can interpolate a continuously-advancing clock
    // between the operator tab's 5s tick syncs — no server filesystem
    // needed (works on Vercel).
    //
    // AWAIT (not fire-and-forget): on Vercel serverless, the lambda is
    // frozen the moment the response is returned. A `void` push would be
    // killed before the LiveKit API call completes, so the TV clock would
    // never advance. Awaiting adds ~200ms but guarantees the metadata
    // reaches LiveKit Cloud. The operator tab sends ticks every 1s, so
    // 200ms of latency is well within the tick window.
    await pushBroadcastMatchUpdate(id).catch(() => {});

    return NextResponse.json({ match: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

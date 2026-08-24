import { NextResponse } from "next/server";

/**
 * GET /api/stream/health
 *
 * Proxies to the broadcast WS server's /health endpoint to find out
 *   - which camera slots are active
 *   - which slot is currently selected for broadcast
 *   - how many viewers are connected
 *   - whether the operator is online
 *
 * Used by the public TV page to know whether to render the broadcast player.
 */
export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:4070/health", {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "WS server unreachable", online: false },
        { status: 503 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, online: false },
      { status: 503 }
    );
  }
}

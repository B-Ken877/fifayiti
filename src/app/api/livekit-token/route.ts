import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

const API_KEY = "medikakey";
const API_SECRET = "7GD6FdL2cP9KTmTLkJVUKNj7XfJjWAMS";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const roomName = body.roomName || "fifayiti-broadcast";
    const participantName = body.participantName || "anonymous";
    const role = body.role || "viewer";

    const token = new AccessToken(API_KEY, API_SECRET, {
      identity: participantName,
      ttl: "12h",
    });

    // All roles can update their own metadata — this is how the operator
    // communicates the selected slot + match data to viewers, and how
    // cameramen identify their slot number.
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: role === "cameraman",
      canSubscribe: role === "operator" || role === "viewer",
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    const jwt = await token.toJwt();

    return NextResponse.json({
      token: jwt,
      wsUrl: "wss://fifayiti.medikahaiti.site/livekit-ws",
      roomName,
    });
  } catch (e: any) {
    console.error("[livekit-token] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

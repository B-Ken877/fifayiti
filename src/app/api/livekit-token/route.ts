import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { LIVEKIT_API_KEY as API_KEY, LIVEKIT_API_SECRET as API_SECRET, LIVEKIT_WS_URL } from "@/lib/streaming/livekit-config";

// TURN: LiveKit Cloud provides global TURN/ICE infrastructure automatically.
// We return an EMPTY turnServers list — the camera page then omits
// rtcConfig.iceServers entirely, letting the client use the ICE servers
// Cloud sends during signaling (overriding them would discard Cloud's
// TURN for cameramen behind carrier-grade NAT).

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

    // TURN credentials for the response. NOTE: the OSS livekit-server-sdk
    // AccessToken has no setIceServers() (that's a LiveKit Cloud feature)
    // — the client passes these iceServers to room.connect({ rtcConfig }).
    // See the camera page's startBroadcast() for the client side.
    return NextResponse.json({
      token: jwt,
      wsUrl: LIVEKIT_WS_URL,
      roomName,
      turnServers: [],
    });
  } catch (e: any) {
    console.error("[livekit-token] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

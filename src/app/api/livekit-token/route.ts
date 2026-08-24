import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import crypto from "crypto";

const API_KEY = "medikakey";
const API_SECRET = "7GD6FdL2cP9KTmTLkJVUKNj7XfJjWAMS";

// TURN server public coordinates (medika-coturn docker container, see
// /opt/turn/docker-compose.yml on the VPS). Port is 3479 — NOT the
// standard 3478, which is already owned by the medika telehealth
// coturn (systemd coturn.service, realm medika.ht) on the same VPS.
const TURN_HOST = "fifayiti.medikahaiti.site";
const TURN_PORT = 3479;
const TURN_SECRET = "fifayiti-turn-shared-secret-2024-change-me";

/**
 * Generate time-limited TURN REST API credentials (RFC 5389 §4 + TURN REST
 * draft) so a cameraman behind CGNAT can relay through coturn without us
 * running an open relay.
 *
 *   username = "<expiry-unix-secs>:<participant-identity>"
 *   credential = base64( HMAC-SHA1(secret, username) )
 */
function mintTurnCredential(participant: string): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h
  const username = `${expiry}:${participant}`;
  const credential = crypto
    .createHmac("sha1", TURN_SECRET)
    .update(username)
    .digest("base64");
  return { username, credential };
}

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
    const turn = mintTurnCredential(participantName);

    return NextResponse.json({
      token: jwt,
      wsUrl: "wss://fifayiti.medikahaiti.site/livekit-ws",
      roomName,
      turnServers: [
        { urls: [`stun:${TURN_HOST}:${TURN_PORT}`] },
        {
          urls: [
            `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
            `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
          ],
          username: turn.username,
          credential: turn.credential,
        },
      ],
    });
  } catch (e: any) {
    console.error("[livekit-token] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

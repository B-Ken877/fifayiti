// FIFAYITI LiveKit connection — single hardcoded config (no env vars).
//
// LiveKit CLOUD (managed) — replaces the retired VPS docker stack
// (livekit-server + coturn + nginx are all handled by Cloud, including
// TURN/ICE for cameramen behind carrier-grade NAT).

export const LIVEKIT_API_KEY = "APIL7FeLAXNanYV";
export const LIVEKIT_API_SECRET = "3fRNdai1qC91mY1STZB8O83d2XMhtCfamPUeC3wKtZyB";

/** LiveKit Cloud project host. */
export const LIVEKIT_HOST = "fifayiti-mohh1dj4.livekit.cloud";

/** Server-side HTTP/twirp API base (room mgmt, egress, ingress). */
export const LIVEKIT_URL = `https://${LIVEKIT_HOST}`;

/** WebSocket signaling URL — handed to browsers. */
export const LIVEKIT_WS_URL = `wss://${LIVEKIT_HOST}`;

// FIFAYITI LiveKit connection — single hardcoded config (no env vars).
//
// IMPORTANT: these coordinates must point at the VPS where livekit-server,
// the egress worker and nginx (HLS) run. They are PUBLIC coordinates:
//   - Browsers use wsUrl (wss via nginx) for WebRTC signaling
//   - Server routes (room mgmt, egress, WHIP/RTMP ingest tokens) use the
//     HTTP API base URL below. This MUST be the public address, NOT
//     127.0.0.1, so it works when the app is deployed on Vercel.
//     (127.0.0.1 would only work if the Next app ran on the VPS itself.)
//
// VPS firewall requirement: port 7880 (TCP) must be reachable from the
// internet for Vercel lambdas to manage rooms/egress.

export const LIVEKIT_API_KEY = "medikakey";
export const LIVEKIT_API_SECRET = "7GD6FdL2cP9KTmTLkJVUKNj7XfJjWAMS";

/** LiveKit HTTP/twirp API base (room mgmt, egress, ingress). */
export const LIVEKIT_URL = "http://fifayiti.medikahaiti.site:7880";

/** LiveKit WebSocket signaling URL — handed to browsers (via nginx TLS proxy). */
export const LIVEKIT_WS_URL = "wss://fifayiti.medikahaiti.site/livekit-ws";

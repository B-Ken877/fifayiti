// FIFAYITI LiveKit connection — env-var-overridable config.
//
// LiveKit CLOUD (managed) — replaces the retired VPS docker stack
// (livekit-server + coturn + nginx are all handled by Cloud, including
// TURN/ICE for cameramen behind carrier-grade NAT).
//
// PHASE 1 CHANGE (spec Phase 1.5):
//   The previous version hardcoded the LiveKit Cloud credentials in
//   source. They are now committed to git history and must be treated
//   as compromised — see the SECURITY note in the final report and
//   rotate them in the LiveKit Cloud dashboard. Going forward, this
//   module reads optional env-var overrides:
//
//     FIFAYITI_LIVEKIT_API_KEY    — overrides the API key
//     FIFAYITI_LIVEKIT_API_SECRET — overrides the API secret
//     FIFAYITI_LIVEKIT_HOST       — overrides the Cloud project host
//     FIFAYITI_BROADCAST_PROVIDER — "livekit" (default) | "disabled"
//
//   Until rotated creds are placed in the env, the hardcoded values
//   remain as FALLBACKS so existing local dev + production deployments
//   continue to work unchanged. The fallback values are NOT a long-term
//   security posture — they are a transitional bridge to env-driven
//   credentials.
//
//   See `src/lib/auth/secret.ts` for the same env-var pattern applied
//   to session-signing secrets.

const ENV_API_KEY = process.env.FIFAYITI_LIVEKIT_API_KEY;
const ENV_API_SECRET = process.env.FIFAYITI_LIVEKIT_API_SECRET;
const ENV_HOST = process.env.FIFAYITI_LIVEKIT_HOST;

// ⚠️ TRANSITIONAL FALLBACK (rotate via the LiveKit Cloud dashboard).
//   These were committed to git history before Phase 1. They MUST be
//   rotated; the env vars above are the production path forward.
const FALLBACK_API_KEY = "APIL7FeLAXNanYV";
const FALLBACK_API_SECRET = "3fRNdai1qC91mY1STZB8O83d2XMhtCfamPUeC3wKtZyB";
const FALLBACK_HOST = "fifayiti-mohh1dj4.livekit.cloud";

export const LIVEKIT_API_KEY = ENV_API_KEY ?? FALLBACK_API_KEY;
export const LIVEKIT_API_SECRET = ENV_API_SECRET ?? FALLBACK_API_SECRET;

/** LiveKit Cloud project host. */
export const LIVEKIT_HOST = ENV_HOST ?? FALLBACK_HOST;

/** Server-side HTTP/twirp API base (room mgmt, egress, ingress). */
export const LIVEKIT_URL = `https://${LIVEKIT_HOST}`;

/** WebSocket signaling URL — handed to browsers. */
export const LIVEKIT_WS_URL = `wss://${LIVEKIT_HOST}`;

/** Diagnostics — does NOT log the secret value. */
export function livekitConfigured() {
  return {
    apiKeyFromEnv: !!ENV_API_KEY,
    apiSecretFromEnv: !!ENV_API_SECRET,
    hostFromEnv: !!ENV_HOST,
    usingFallbackCreds: !ENV_API_KEY || !ENV_API_SECRET,
  };
}

// FIFAYITI session-signing secret — HARDCODED by design (no env vars).
//
// This is the HMAC-SHA256 key that signs admin session cookies. It is NOT a
// password — it never leaves the server. Rotating it invalidates all active
// admin sessions (everyone gets logged out), nothing else.
//
// To rotate: openssl rand -hex 32  → paste the new value below, redeploy.
//
// ⚠️ Anyone who can read this repository can forge admin sessions.
//    Keep the repo private.

export const FIFAYITI_AUTH_SECRET =
  "8e9fee63af98d16b5074f0e2adfab8a5b71b2bae7832f1bcf69b6cd2ca334da0";

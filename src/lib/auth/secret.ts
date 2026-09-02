// FIFAYITI — session-signing secrets (env-var driven, fails safely).
//
// ⚠️ The previous hardcoded secret was committed to a PUBLIC repository
//    and is therefore COMPROMISED. This module reads from environment
//    variables instead and refuses to boot in production if they are
//    missing. A fresh secret has been generated for the new deployment.
//
// TWO SEPARATE SECRETS:
//   1. FIFAYITI_AUTH_SECRET    — signs admin/staff session cookies
//   2. FIFAYITI_BETTING_SECRET — signs bettor session cookies + financial
//                                payloads (separate so a leaked admin cookie
//                                secret cannot forge bettor sessions, and
//                                vice versa).
//
// SECRETS ARE NEVER LOGGED. Missing secrets in production throw at boot
// (fail-closed). In dev/test, a deterministic fallback is used so local
// work doesn't require env vars.
//
// ROTATION: changing the env var value invalidates ALL sessions signed
// with the old value (everyone gets logged out). That is by design.

const isProduction = process.env.NODE_ENV === "production";

// ── Admin/staff session secret ────────────────────────────────────────
const AUTH_SECRET_ENV = process.env.FIFAYITI_AUTH_SECRET;
const BETTING_SECRET_ENV = process.env.FIFAYITI_BETTING_SECRET;

// Dev/test fallback (deterministic, NOT for production). Prefixed so they
// are obviously not real secrets if they ever appear in logs.
const DEV_AUTH_SECRET = "DEV_ONLY_fifayiti_auth_secret_change_me_in_prod_0123456789abcdef";
const DEV_BETTING_SECRET = "DEV_ONLY_fifayiti_betting_secret_change_me_in_prod_0123456789abcdef";

if (isProduction) {
  if (!AUTH_SECRET_ENV || AUTH_SECRET_ENV.length < 32) {
    throw new Error(
      "FIFAYITI_AUTH_SECRET environment variable is required in production (min 32 chars). " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  if (!BETTING_SECRET_ENV || BETTING_SECRET_ENV.length < 32) {
    throw new Error(
      "FIFAYITI_BETTING_SECRET environment variable is required in production (min 32 chars). " +
      "Generate one with: openssl rand -hex 32"
    );
  }
}

/** HMAC secret for admin/staff session cookies. NEVER log this value. */
export const FIFAYITI_AUTH_SECRET: string =
  AUTH_SECRET_ENV ?? DEV_AUTH_SECRET;

/** HMAC secret for bettor session cookies + financial payloads. Separate
 *  from the admin secret so a compromise of one does not forge the other. */
export const FIFAYITI_BETTING_SECRET: string =
  BETTING_SECRET_ENV ?? DEV_BETTING_SECRET;

/** Check (for diagnostics — does NOT log the value itself). */
export function secretsConfigured(): { auth: boolean; betting: boolean; production: boolean } {
  return {
    auth: !!AUTH_SECRET_ENV && AUTH_SECRET_ENV.length >= 32,
    betting: !!BETTING_SECRET_ENV && BETTING_SECRET_ENV.length >= 32,
    production: isProduction,
  };
}

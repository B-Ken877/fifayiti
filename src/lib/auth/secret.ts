// FIFAYITI — session-signing secrets (env-var driven, fails safely).
//
// ⚠️ The previous hardcoded secret was committed to a PUBLIC repository
//    and is therefore COMPROMISED. This module reads from environment
//    variables instead.
//
// TWO SEPARATE SECRETS:
//   1. FIFAYITI_AUTH_SECRET    — signs admin/staff session cookies
//   2. FIFAYITI_BETTING_SECRET — signs bettor session cookies + financial
//                                payloads (separate so a leaked admin cookie
//                                secret cannot forge bettor sessions, and
//                                vice versa).
//
// FAIL-CLOSED AT RUNTIME (not at module-evaluation / build time):
//   In production (NODE_ENV=production), the first time a route HANDLER
//   calls getAuthSecret() / getBettingSecret(), the function throws if
//   the env var is missing or too short. This defers the failure to
//   request time so the build (which evaluates module top-level code for
//   page-data collection) doesn't crash.
//
// DEV/TEST FALLBACK:
//   When NODE_ENV !== 'production', deterministic DEV_ONLY_ values are
//   used so local work doesn't require env vars.

const isProduction = process.env.NODE_ENV === "production";
const AUTH_SECRET_ENV = process.env.FIFAYITI_AUTH_SECRET;
const BETTING_SECRET_ENV = process.env.FIFAYITI_BETTING_SECRET;

const DEV_AUTH_SECRET = "DEV_ONLY_fifayiti_auth_secret_change_me_in_prod_0123456789abcdef";
const DEV_BETTING_SECRET = "DEV_ONLY_fifayiti_betting_secret_change_me_in_prod_0123456789abcdef";

function ensureProdSecret(name: string, value: string | undefined): string {
  if (!value || value.length < 32) {
    throw new Error(
      `${name} environment variable is required in production (min 32 chars). ` +
      `Generate one with: openssl rand -hex 32`,
    );
  }
  return value;
}

/** HMAC secret for admin/staff session cookies. NEVER log this value.
 *  In production, throws at first call if the env var is missing. */
export function getAuthSecret(): string {
  if (isProduction) return ensureProdSecret("FIFAYITI_AUTH_SECRET", AUTH_SECRET_ENV);
  return AUTH_SECRET_ENV ?? DEV_AUTH_SECRET;
}

/** HMAC secret for bettor session cookies + financial payloads.
 *  Separate from the admin secret so a compromise of one does not forge the other. */
export function getBettingSecret(): string {
  if (isProduction) return ensureProdSecret("FIFAYITI_BETTING_SECRET", BETTING_SECRET_ENV);
  return BETTING_SECRET_ENV ?? DEV_BETTING_SECRET;
}

/** Diagnostics — does NOT log the value itself. */
export function secretsConfigured() {
  return {
    auth: !!AUTH_SECRET_ENV && AUTH_SECRET_ENV.length >= 32,
    betting: !!BETTING_SECRET_ENV && BETTING_SECRET_ENV.length >= 32,
    production: isProduction,
  };
}

// server-only — signed-cookie session helpers for FIFAYITI admin auth.
//
// Session payload: { role, issuedAt, expiresAt } encoded as JSON, then
// HMAC-SHA256 signed with FIFAYITI_AUTH_SECRET. Sent as an httpOnly cookie.
//
// The cookie is tamper-evident (signature is checked on read). The role
// cannot be spoofed by editing the cookie — the signature won't match.
//
// NOT a JWT — we keep it minimal because we only have 5 fixed admin
// accounts and no third-party claims. The server re-derives the role
// from the cookie on every privileged call.

import { createHmac, timingSafeEqual } from "crypto";
import type { FifayitiRole } from "./credentials";

const COOKIE_NAME = "fifayiti-session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours — covers a match day

/** Read the HMAC secret from env. Crash if missing — fail-closed. */
function getSecret(): string {
  const s = process.env.FIFAYITI_AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "FIFAYITI_AUTH_SECRET is missing or too short (<32 chars). " +
      "Generate one with: openssl rand -hex 32",
    );
  }
  return s;
}

interface SessionPayload {
  role: FifayitiRole;
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${mac}`;
}

function verify(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expectedMac = createHmac("sha256", getSecret()).update(body).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expectedMac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (typeof payload.role !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** "Set-Cookie" header value for a freshly-issued session. */
export function createSessionCookie(role: FifayitiRole): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    role,
    iat: now,
    exp: now + COOKIE_MAX_AGE_SECONDS,
  };
  const token = sign(payload);
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ].join("; ");
}

/** "Set-Cookie" header value that immediately expires the session cookie. */
export function createExpiredCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Read a request's session role, or null if absent / invalid / expired. */
export function getSessionRole(cookieHeader: string | null): FifayitiRole | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verify(token);
  return payload ? payload.role : null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

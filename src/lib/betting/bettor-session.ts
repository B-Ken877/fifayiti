// FIFAYITI PARIAJ — bettor session helpers.
//
// Bettor sessions are HMAC-signed cookies (same pattern as the existing
// admin auth in src/lib/auth/session.ts). The cookie carries the bettor's
// id + email — the server re-verifies on every privileged call.
//
// Bettor auth is SEPARATE from admin auth (different cookie name, different
// signing context) so a bettor can never escalate to an admin role.

import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "crypto";
import { FIFAYITI_AUTH_SECRET } from "@/lib/auth/secret";
import { db } from "@/lib/db";

const BETTOR_COOKIE_NAME = "fifayiti-bettor";
const BETTOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface BettorSessionPayload {
  bettorId: string;
  email: string;
  iat: number;
  exp: number;
}

function sign(payload: BettorSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", FIFAYITI_AUTH_SECRET + ":bettor").update(body).digest("hex");
  return `${body}.${mac}`;
}

function verify(token: string): BettorSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expectedMac = createHmac("sha256", FIFAYITI_AUTH_SECRET + ":bettor").update(body).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expectedMac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (typeof payload.bettorId !== "string" || typeof payload.email !== "string") return null;
    if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) return null;
    return payload as BettorSessionPayload;
  } catch {
    return null;
  }
}

/** Hash a plaintext password with scrypt (server-only). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, {
    N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
  });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, 32, {
    N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Create a Set-Cookie header for a freshly-issued bettor session. */
export function createBettorSessionCookie(bettorId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: BettorSessionPayload = {
    bettorId, email, iat: now, exp: now + BETTOR_COOKIE_MAX_AGE,
  };
  const token = sign(payload);
  return [
    `${BETTOR_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${BETTOR_COOKIE_MAX_AGE}`,
  ].join("; ");
}

/** Expire the bettor session cookie immediately. */
export function expireBettorCookie(): string {
  return `${BETTOR_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Read the bettor's id from the cookie, or null. */
export function getBettorId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const token = cookies[BETTOR_COOKIE_NAME];
  if (!token) return null;
  const payload = verify(token);
  return payload?.bettorId ?? null;
}

/** Get the full bettor record, or null if the session is invalid/banned. */
export async function getAuthenticatedBettor(cookieHeader: string | null) {
  const bettorId = getBettorId(cookieHeader);
  if (!bettorId) return null;
  try {
    const bettor = await db.bettor.findUnique({ where: { id: bettorId } });
    if (!bettor || bettor.status !== "ACTIVE") return null;
    return bettor;
  } catch {
    return null;
  }
}

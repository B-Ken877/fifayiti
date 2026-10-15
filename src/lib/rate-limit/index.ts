// FIFAYITI — rate limiting.
//
// Fixed-window rate limiter. Local development uses memory; production uses
// an atomic Upstash Redis counter shared by every serverless instance.
//
// CURRENT LIMITS (configurable):
//   - login:           10 / min per IP + email combo   (brute-force protection)
//   - register:         5 / hour per IP                (account-spam protection)
//   - bet place:       20 / min per bettor            (API abuse)
//   - wallet deposit:   3 / hour per bettor           (payment abuse)
//   - wallet withdraw:  3 / hour per bettor
//   - market publish:  10 / min per operator
//   - event create:    30 / min per operator          (live events are frequent)
//   - emergency susp:   2 / min per operator          (kill switch — rare)

import { createHash } from "crypto";

interface Bucket { count: number; windowStart: number; }
interface BucketStore {
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number };
}

// ── In-memory store (per-lambda; soft limit) ──────────────────────────
class MemoryStore implements BucketStore {
  private buckets = new Map<string, Bucket>();

  hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= windowMs) {
      // Fresh window.
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: limit - 1, resetMs: windowMs };
    }
    if (b.count >= limit) {
      // Bucket exhausted.
      return { allowed: false, remaining: 0, resetMs: windowMs - (now - b.windowStart) };
    }
    b.count++;
    return { allowed: true, remaining: limit - b.count, resetMs: windowMs - (now - b.windowStart) };
  }
}

// Singleton — shared across requests in the same lambda instance.
let _store: BucketStore | null = null;
function store(): BucketStore {
  if (!_store) _store = new MemoryStore();
  return _store;
}

/**
 * Check the rate limit for a key. Returns { allowed, remaining, resetMs }.
 * On `allowed=false` the caller should return 429 Too Many Requests.
 */
export function rateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetMs: number; available: boolean }> {
  const key = `${scope}:${identifier}`;
  if (process.env.NODE_ENV !== "production") {
    return Promise.resolve({ ...store().hit(key, limit, windowMs), available: true });
  }

  // Support both native Upstash names and the Vercel integration's KV names.
  const redisUrl = (
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  )?.replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken || !redisUrl.startsWith("https://")) {
    return Promise.resolve({ allowed: false, remaining: 0, resetMs: windowMs, available: false });
  }

  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n";
  return fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "EVAL", script, "1",
      `fifayiti:ratelimit:${createHash("sha256").update(key).digest("hex")}`,
      String(windowMs),
    ]),
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) throw new Error(`rate-limit store returned ${response.status}`);
    const payload = await response.json();
    const count = Number(payload?.result);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("invalid rate-limit response");
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetMs: windowMs, available: true };
  }).catch((error) => {
    console.error("[rate-limit] shared store unavailable:", error?.message);
    return { allowed: false, remaining: 0, resetMs: windowMs, available: false };
  });
}

// ── Pre-configured limit presets ──────────────────────────────────────
export const LIMITS = {
  LOGIN:        { limit: 10, windowMs: 60_000 },         // 10/min per IP+email
  REGISTER:     { limit: 5,  windowMs: 60 * 60_000 },    // 5/hour per IP
  BET_PLACE:    { limit: 20, windowMs: 60_000 },         // 20/min per bettor
  DEPOSIT:      { limit: 3,  windowMs: 60 * 60_000 },    // 3/hour per bettor
  WITHDRAW:     { limit: 3,  windowMs: 60 * 60_000 },
  MARKET_PUB:   { limit: 10, windowMs: 60_000 },
  EVENT_CREATE: { limit: 30, windowMs: 60_000 },
  EMERGENCY:    { limit: 2,  windowMs: 60_000 },
} as const;

/** Convenience: extract a client IP from a Next.js request (best-effort). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Build a standard 429 response body. */
export function rateLimitedResponse(resetMs: number) {
  return {
    status: 429,
    error: "Trop demann. Eseye ankò nan kèk segond.",
    retryAfterMs: resetMs,
  };
}

// Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
// Requests fail closed with a 503 if the shared limiter is not available.

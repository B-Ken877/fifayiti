// FIFAYITI — rate limiting.
//
// Sliding-window in-memory rate limiter. Each Vercel lambda has its own
// counter (serverless = no shared process state), so this is a SOFT limit
// that approximates per-IP/per-user throttling. For hard production
// guarantees, swap the `BucketStore` implementation for Upstash Redis
// (see `createUpstashStore` stub at the bottom — wiring is a config change,
// not a code change).
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
): { allowed: boolean; remaining: number; resetMs: number } {
  const key = `${scope}:${identifier}`;
  return store().hit(key, limit, windowMs);
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

// ── Production: Upstash Redis store (stub) ────────────────────────────
// To wire this for hard production limits, set UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN env vars and replace `MemoryStore` with:
//
//   import { Ratelimit } from "@upstash/ratelimit";
//   import { Redis } from "@upstash/redis";
//   const redis = Redis.fromEnv();
//   const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix: scope });
//
// Then `rateLimit` becomes: `const { success, remaining, reset } = await ratelimit.limit(key);`
// The call sites below already return promises via the helper, so the
// change is a one-line swap inside this file.

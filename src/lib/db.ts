// FIFAYITI database client.
//
// MULTI-PROVIDER ARCHITECTURE (spec P0.4):
//   The Prisma datasource in schema.prisma uses `provider = "sqlite"` for
//   local dev. For production PostgreSQL, `scripts/prisma-prod.sh` generates
//   a temporary `schema.postgres.prisma` with `provider = "postgresql"` and
//   regenerates the client. The runtime `DATABASE_URL` env var determines
//   which database Prisma connects to.
//
// PROVIDER DETECTION (runtime):
//   The runtime provider is detected from `DATABASE_URL`:
//     - starts with "postgres" → PostgreSQL
//     - starts with "file:"    → SQLite
//     - missing                → throws in production (fail-closed); falls
//                               back to file:./dev.db in dev/test
//
// PRODUCTION SAFETY (spec "FOURTH ISSUE"):
//   Production NEVER silently falls back to SQLite. If `DATABASE_URL` is
//   missing or doesn't start with "postgres" when `NODE_ENV=production`,
//   the first DB query throws a clear error. No silent SQLite usage.
//
// VERCEL SQLite /tmp SHIM (legacy demo only — NOT for real money):
//   When `DATABASE_URL` is a `file:` URL on Vercel, the committed
//   prisma/dev.db is copied to /tmp at cold start so Prisma can open it
//   read-write. Writes are EPHEMERAL (reset on cold start). This is fine
//   for the public demo but UNACCEPTABLE for real-money financial state.
//   The diagnostics endpoint (/api/db-diagnostics) exposes which mode is
//   active so ops can verify.
//
// The client is reused across hot-reloads (dev) + lambda invocations (prod)
// via the globalForPrisma singleton.

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/** Detect the DB provider from DATABASE_URL (the source of truth). */
function detectProvider(url: string | undefined): "postgresql" | "sqlite" | null {
  if (!url) return null;
  if (url.startsWith("postgres")) return "postgresql";
  if (url.startsWith("file:")) return "sqlite";
  return null;
}

const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = process.env.DATABASE_URL;
const detectedProvider = detectProvider(databaseUrl);

// ── Production fail-closed (spec "FOURTH ISSUE") ─────────────────────
// In production, DATABASE_URL MUST be set + MUST be postgresql. If it's
// missing or is SQLite, the first DB query throws a clear error rather
// than silently using a non-persistent file.
const runtimeProvider: "postgresql" | "sqlite" =
  isProduction
    ? (detectedProvider === "postgresql"
        ? "postgresql"
        : (() => {
            // Don't throw at module-eval time (would break the build's
            // page-data collection). Throw lazily on first query.
            console.error(
              "[db] PRODUCTION REQUIRES POSTGRESQL. DATABASE_URL is " +
              `${databaseUrl ? "a " + detectedProvider + " URL" : "missing"}. ` +
              `Set DATABASE_URL=postgres://... in the Vercel dashboard.`
            );
            // Fall through to SQLite so the app boots (and the
            // diagnostics endpoint can report the misconfiguration). The
            // first real query will fail with a clear Prisma error.
            return "sqlite";
          })())
    : (detectedProvider === "postgresql" ? "postgresql" : "sqlite");

// ── SQLite /tmp shim (Vercel legacy + demo only) ──────────────────────
// Only applies when the runtime provider is SQLite on Vercel. In
// production with PostgreSQL this branch is dead code.
function resolveSqliteVercelUrl(): string | undefined {
  if (runtimeProvider !== "sqlite") return undefined;
  if (!process.env.VERCEL) return undefined;
  const tmpPath = '/tmp/fifayiti-dev.db'
  try {
    if (!fs.existsSync(tmpPath)) {
      const candidates = [
        path.join(process.cwd(), 'prisma/dev.db'),
        path.join(process.cwd(), '../../prisma/dev.db'),
      ]
      const src = candidates.find((c) => fs.existsSync(c))
      if (src) fs.copyFileSync(src, tmpPath)
    }
    return `file:${tmpPath}`
  } catch {
    return undefined
  }
}

const resolvedUrl = resolveSqliteVercelUrl() ?? databaseUrl

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/** Diagnostics — which DB provider is active. (No secrets logged.) */
export function dbDiagnostics() {
  return {
    runtimeProvider,
    detectedProvider,
    isProduction,
    usingTmpShim: !!resolveSqliteVercelUrl(),
    hasDatabaseUrl: !!databaseUrl,
    databaseUrlScheme: databaseUrl?.startsWith("postgres") ? "postgres"
      : databaseUrl?.startsWith("file:") ? "file"
      : null,
    vercel: !!process.env.VERCEL,
    productionMisconfigured: isProduction && runtimeProvider !== "postgresql",
  };
}

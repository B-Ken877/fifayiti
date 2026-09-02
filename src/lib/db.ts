// FIFAYITI database client.
//
// MULTI-PROVIDER ARCHITECTURE (spec P0.4):
//   The Prisma datasource in schema.prisma reads `DATABASE_PROVIDER` +
//   `DATABASE_URL` env vars. Local dev uses SQLite; production PARIAJ
//   financial data uses PostgreSQL.
//
// LOCAL DEV (default — no env vars needed):
//   DATABASE_PROVIDER defaults to "sqlite"
//   DATABASE_URL defaults to "file:./dev.db"
//
// VERCEL WITH SQLITE (legacy + demo only):
//   The committed prisma/dev.db is copied to /tmp at cold start so Prisma
//   can open it read-write. Writes are EPHEMERAL (reset on cold start) —
//   this is fine for the demo but UNACCEPTABLE for real-money financial
//   state. Set DATABASE_PROVIDER=postgresql + DATABASE_URL=postgres://...
//   for production.
//
// PRODUCTION (Postgres — Neon / Supabase / Vercel Postgres):
//   Set DATABASE_PROVIDER=postgresql + DATABASE_URL=postgres://... in the
//   Vercel dashboard. The Prisma client connects directly (no /tmp shim).
//   All financial models carry PostgreSQL-specific constraints (partial
//   unique indexes, etc.) that SQLite approximates with app-level checks.
//
// The client is reused across hot-reloads (dev) + lambda invocations (prod)
// via the globalForPrisma singleton.

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const provider = process.env.DATABASE_PROVIDER ?? 'sqlite'
const isPostgres = provider === 'postgresql'

// ── SQLite /tmp shim (Vercel legacy + demo only) ──────────────────────
// On PostgreSQL this is skipped — Prisma connects directly via DATABASE_URL.
function resolveSqliteVercelUrl(): string | undefined {
  if (isPostgres) return undefined
  if (!process.env.VERCEL) return undefined
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

const resolvedUrl = resolveSqliteVercelUrl()

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
    provider,
    isPostgres,
    resolvedUrl: resolvedUrl ? 'sqlite-tmp' : 'env',
    vercel: !!process.env.VERCEL,
  };
}

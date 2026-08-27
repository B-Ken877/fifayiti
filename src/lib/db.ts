import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ── Vercel writable-DB shim ─────────────────────────────────────────────
// Vercel's serverless filesystem is read-only. The committed prisma/dev.db
// (bundled with each deploy) is copied to /tmp at cold start so Prisma can
// open it read-write. Writes live as long as the lambda instance is warm;
// every redeploy/cold container resets to the committed baseline. Zero
// config — VERCEL is auto-injected by the platform.
function resolveVercelDbUrl(): string | undefined {
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
    return undefined // fall back to bundled (read-only) url
  }
}

const vercelUrl = resolveVercelDbUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    ...(vercelUrl ? { datasources: { db: { url: vercelUrl } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
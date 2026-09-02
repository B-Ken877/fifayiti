// GET /api/db-diagnostics — runtime database provider check.
// Returns which DB provider is active + whether the /tmp shim is in use.
// NO secrets exposed. Used to diagnose the prod DB architecture.

import { NextResponse } from "next/server";
import { dbDiagnostics } from "@/lib/db";
import { secretsConfigured } from "@/lib/auth/secret";

export async function GET() {
  return NextResponse.json({
    db: dbDiagnostics(),
    secrets: secretsConfigured(),
    env: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      VERCEL: !!process.env.VERCEL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlScheme: process.env.DATABASE_URL?.startsWith("postgres") ? "postgres" : process.env.DATABASE_URL?.startsWith("file:") ? "file" : "none",
      hasDatabaseProvider: !!process.env.DATABASE_PROVIDER,
      databaseProvider: process.env.DATABASE_PROVIDER ?? null,
    },
  });
}

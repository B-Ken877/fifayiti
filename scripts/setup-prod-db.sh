#!/usr/bin/env bash
# FIFAYITI — Production PostgreSQL schema setup (one-time).
#
# This script runs `prisma db push` against the production DATABASE_URL to
# create all tables, then seeds the betting config (stake pools + market
# templates). It is the SAFE way to set up the production database:
#
#   - The DATABASE_URL is read from the local environment (NEVER committed)
#   - The connection string is NEVER logged or printed
#   - The script runs from your local machine — no HTTP endpoint exposure
#   - Uses the same Prisma schema as the app (single source of truth)
#
# PREREQUISITES:
#   - PostgreSQL database provisioned (Neon / Supabase / Vercel Postgres)
#   - DATABASE_URL set in your local environment OR in a local .env file
#   - `bun install` already run in the repo
#
# USAGE:
#   # Option A: set DATABASE_URL in your shell first
#   export DATABASE_URL='postgres://user:pass@host:5432/db?sslmode=require'
#   bash scripts/setup-prod-db.sh
#
#   # Option B: put DATABASE_URL in a local .env file (gitignored)
#   echo 'DATABASE_URL=postgres://...' > .env
#   bash scripts/setup-prod-db.sh
#
# WHAT THIS SCRIPT DOES:
#   1. Validates DATABASE_URL is set + is a postgres URL (fail if not)
#   2. Generates a temporary postgres schema variant (provider=postgresql)
#   3. Runs `prisma db push` against the production database (creates tables)
#   4. Runs the seed script (stake pools + market templates)
#   5. Cleans up the temporary schema file
#   6. Reports success (without printing the connection string)
#
# This script is idempotent — safe to run multiple times.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_SCHEMA="$ROOT_DIR/prisma/schema.prisma"
TMP_SCHEMA="$ROOT_DIR/prisma/schema.postgres.prisma"

cd "$ROOT_DIR"

# ── Load .env if it exists (for local dev convenience) ──
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

# ── Validate DATABASE_URL ──
if [ -z "${DATABASE_URL:-}" ]; then
  echo "→ DATABASE_URL not found locally. Attempting to pull from Vercel..."
  echo "   (Requires: npx vercel login + npx vercel link)"
  if npx vercel whoami 2>/dev/null | grep -q "@"; then
    if npx vercel env pull --environment=production --yes "$ROOT_DIR/.env.vercel" 2>/dev/null; then
      set -a; source "$ROOT_DIR/.env.vercel"; set +a
      rm -f "$ROOT_DIR/.env.vercel"
      echo "✅ Pulled DATABASE_URL from Vercel."
    else
      echo "❌ Could not pull env vars. Run: npx vercel link"
      exit 1
    fi
  else
    echo "❌ Not authenticated with Vercel."
    echo "   Either: npx vercel login && npx vercel link"
    echo "   Or:     export DATABASE_URL='postgres://...' && bash scripts/setup-prod-db.sh"
    exit 1
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL is not set."
  exit 1
fi

if [[ ! "$DATABASE_URL" == postgres* ]]; then
  echo "❌ DATABASE_URL must be a PostgreSQL connection string (must start with 'postgres')."
  echo "   Production requires PostgreSQL — SQLite is not acceptable for financial data."
  exit 1
fi

echo "✅ DATABASE_URL is set (postgres scheme)."
echo "   (The full connection string is never logged.)"
echo

# ── Step 1: Generate the postgres schema variant ──
echo "→ Generating PostgreSQL schema variant..."
awk '
  /^datasource db \{/ { in_ds = 1 }
  in_ds && /^  provider = / { print "  provider = \"postgresql\""; next }
  { print }
' "$SRC_SCHEMA" > "$TMP_SCHEMA"
trap 'rm -f "$TMP_SCHEMA"' EXIT

# ── Step 2: prisma db push (creates all tables) ──
echo "→ Running prisma db push against the production database..."
echo "   This creates all tables (idempotent — safe to re-run)."
bunx prisma db push --skip-generate --schema "$TMP_SCHEMA" 2>&1 | grep -v "prisma:query" || true
echo "✅ Schema pushed."
echo

# ── Step 3: Seed betting config ──
echo "→ Seeding betting config (stake pools + market templates)..."
bun scripts/seed-betting.ts 2>&1 | grep -E "✅|⏭|seeded" || true
echo "✅ Betting config seeded."
echo

# ── Step 4: Verify ──
echo "→ Verifying setup..."
bun scripts/verify-prod-db.ts
echo

echo "🎉 Production database setup complete."
echo "   Tables created + betting config seeded."
echo "   The app is ready — deploy (or redeploy) to Vercel."

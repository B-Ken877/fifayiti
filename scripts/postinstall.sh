#!/usr/bin/env bash
# FIFAYITI — Prisma postinstall hook.
#
# Detects the target database provider from DATABASE_URL and generates
# the correct Prisma client. This is critical: if Vercel has
# DATABASE_URL=postgres://... but we generate a SQLite client, the
# runtime queries fail with a provider mismatch.
#
# Logic:
#   1. If DATABASE_URL starts with "postgres" → generate a PostgreSQL client
#      (via the temporary schema.postgres.prisma produced by prisma-prod.sh).
#   2. Otherwise → generate a SQLite client (local dev / test).
#
# This script is invoked by `postinstall` in package.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_SCHEMA="$ROOT_DIR/prisma/schema.prisma"

cd "$ROOT_DIR"

if [[ "${DATABASE_URL:-}" == postgres* ]]; then
  echo "[postinstall] DATABASE_URL is PostgreSQL — generating PostgreSQL Prisma client."
  TMP_SCHEMA="$ROOT_DIR/prisma/schema.postgres.prisma"
  awk '
    /^datasource db \{/ { in_ds = 1 }
    in_ds && /^  provider = / { print "  provider = \"postgresql\""; next }
    { print }
  ' "$SRC_SCHEMA" > "$TMP_SCHEMA"
  trap 'rm -f "$TMP_SCHEMA"' EXIT
  bunx prisma generate --schema "$TMP_SCHEMA"
else
  echo "[postinstall] DATABASE_URL is SQLite (or unset) — generating SQLite Prisma client."
  # For SQLite, the schema's default provider=sqlite is correct.
  bunx prisma generate
fi

#!/usr/bin/env bash
# FIFAYITI — Prisma wrapper for PostgreSQL (production).
#
# Usage:
#   ./scripts/prisma-prod.sh db push        # push schema to Postgres
#   ./scripts/prisma-prod.sh migrate dev    # create + apply migration
#   ./scripts/prisma-prod.sh generate        # regenerate client for Postgres
#
# Requires:
#   DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
#
# How it works: the committed schema.prisma uses SQLite for local dev.
# This script generates a temporary postgres variant (same models, just
# the datasource block swapped) and runs the Prisma CLI against it.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL environment variable is required for PostgreSQL."
  echo "   Example: export DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_SCHEMA="$ROOT_DIR/prisma/schema.prisma"
TMP_SCHEMA="$ROOT_DIR/prisma/schema.postgres.prisma"

# Generate the postgres variant: replace the datasource provider line.
# Everything else (models, enums, indexes) stays identical.
awk '
  /^datasource db \{/ { in_ds = 1 }
  in_ds && /^  provider = / { print "  provider = \"postgresql\""; next }
  { print }
' "$SRC_SCHEMA" > "$TMP_SCHEMA"

trap 'rm -f "$TMP_SCHEMA"' EXIT

echo "→ Running: prisma $* --schema $TMP_SCHEMA"
cd "$ROOT_DIR"
exec bunx prisma "$@" --schema "$TMP_SCHEMA"

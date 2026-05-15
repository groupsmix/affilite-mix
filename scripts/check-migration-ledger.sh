#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-migration-ledger.sh — audit follow-up G-MD-01
#
# Fails when the production migration ledger
# (`public._migrations_applied`) is behind the newest non-down
# `*.sql` file in `supabase/migrations/`. This is the post-deploy
# safety net that catches the failure mode where the
# `migrate-production` job was skipped (e.g. because
# `SUPABASE_DB_URL` was unset) but the build/deploy continued.
#
# Inputs (env):
#   SUPABASE_DB_URL          — direct postgres URL (preferred)
#   SUPABASE_DB_POOLER_URL   — session pooler URL (fallback for IPv6 hosts)
#   MIGRATIONS_DIR           — defaults to supabase/migrations
#   ALLOW_DOWN               — set to 1 to also count -down.sql files
#                              (we don't, by default — they are not
#                              auto-applied)
#
# Exit codes:
#   0  ledger == newest repo migration
#   1  ledger is behind (deploy must be considered failed)
#   2  could not connect / could not read repo
#
# ────────────────────────────────────────────────────────────

set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
DB_URL="${SUPABASE_DB_POOLER_URL:-${SUPABASE_DB_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo "::error::check-migration-ledger: SUPABASE_DB_URL or SUPABASE_DB_POOLER_URL must be set" >&2
  exit 2
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "::error::check-migration-ledger: migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 2
fi

# Newest non-down migration file in the repo.
newest_repo=$(
  find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | grep -v -- '-down\.sql$' \
    | sort \
    | tail -n 1
)

if [ -z "$newest_repo" ]; then
  echo "::error::check-migration-ledger: no migrations found in $MIGRATIONS_DIR" >&2
  exit 2
fi

# Newest filename recorded in the production ledger. The ledger may
# legitimately not exist in fresh staging environments; treat that as
# 'behind', which forces the migrate step to run.
newest_db=$(
  psql "$DB_URL" -tA -v ON_ERROR_STOP=0 -c \
    "SELECT COALESCE(MAX(filename), '') FROM public._migrations_applied WHERE filename NOT LIKE '%-down.sql';" \
    2>/dev/null \
  || echo ""
)

# Strip whitespace defensively.
newest_db=$(echo "$newest_db" | tr -d '[:space:]')

if [ -z "$newest_db" ]; then
  echo "::error::check-migration-ledger: ledger empty or unreachable; refusing to greenwash deploy" >&2
  exit 1
fi

if [ "$newest_db" \< "$newest_repo" ]; then
  echo "::error::check-migration-ledger: ledger behind repo" >&2
  echo "  newest in repo: $newest_repo" >&2
  echo "  newest in DB:   $newest_db" >&2
  echo "Run the migrate-production stage and re-deploy." >&2
  exit 1
fi

echo "check-migration-ledger: OK — ledger ($newest_db) >= repo ($newest_repo)"

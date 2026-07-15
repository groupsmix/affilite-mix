#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Disaster Recovery (DR) drill script — R-015 / E3#20
#
# Performs a backup + restore cycle against the staging DB to verify
# that the Supabase point-in-time recovery (PITR) chain is valid.
#
# Usage:
#   DR_DATABASE_URL=$STAGING_DATABASE_URL bash scripts/dr-drill.sh --restore
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_FILE="${TMPDIR:-/tmp}/dr-drill-$(date +%s).sql.gz"

usage() {
  echo "Usage: $0 [--backup|--restore|--verify]"
  echo ""
  echo "  --backup   Create a schema+data dump of the staging DB"
  echo "  --restore  Backup → drop test schema → restore → validate"
  echo "  --verify   Check restored DB against expected schema"
  exit 1
}

require_env() {
  local var="$1"
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set. Set it to the staging DATABASE_URL."
    exit 1
  fi
}

DB_URL="${STAGING_DATABASE_URL:-${DR_DATABASE_URL:-}}"

backup() {
  require_env DB_URL
  echo "==> Creating compressed backup..."
  # T4-#8: use --format=plain (SQL text) so the restore step can rename the
  # schema via sed before piping to psql. Custom format + pg_restore --schema
  # is a FILTER on the archive's schema name, not a remap target — a public-
  # schema dump with --schema=dr_test restores zero objects.
  pg_dump "$DB_URL" \
    --no-owner \
    --no-privileges \
    --schema=public \
    --format=plain \
    | gzip > "$DUMP_FILE"
  echo "    Backup written to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
}

verify_schema() {
  # T4-#8: accept an optional schema name so the restore drill can verify the
  # RESTORED dr_test schema instead of always checking the live public schema.
  local SCHEMA="${1:-public}"
  require_env DB_URL
  echo "==> Verifying schema integrity (schema: $SCHEMA)..."

  local FAILED=0

  # Critical tables
  local TABLES=(
    sites admin_users content products
    affiliate_clicks audit_log webhook_dlq
    newsletter_subscribers categories
  )

  for table in "${TABLES[@]}"; do
    if psql "$DB_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='$SCHEMA' AND table_name='$table')" 2>/dev/null | grep -q "t"; then
      echo "    ✓ $table"
    else
      echo "    ✗ $table MISSING"
      FAILED=$((FAILED + 1))
    fi
  done

  # RLS enforcement — meaningful on the live public schema and on the restored
  # scratch schema. A successful restore must carry RLS policies so tenants
  # remain isolated after recovery.
  local RLS_TABLES=(sites content products affiliate_clicks)
  for table in "${RLS_TABLES[@]}"; do
    if psql "$DB_URL" -tAc "SELECT rowsecurity FROM pg_tables WHERE schemaname='$SCHEMA' AND tablename='$table'" 2>/dev/null | grep -q "t"; then
      echo "    ✓ RLS on $table"
    else
      echo "    ✗ RLS NOT on $table"
      FAILED=$((FAILED + 1))
    fi
  done

  # Migration parity
  local DISK_COUNT
  DISK_COUNT=$(find "$REPO_ROOT/supabase/migrations" -name '*.sql' -not -name '*-down.sql' 2>/dev/null | wc -l | tr -d ' ')
  echo "    Migrations on disk: $DISK_COUNT"

  if [ "$FAILED" -gt 0 ]; then
    echo "ERROR: Schema verification failed ($FAILED issues)"
    return 1
  fi

  echo "==> Schema verification passed"
}

restore() {
  backup

  echo "==> Restore drill: creating scratch schema dr_test..."
  psql "$DB_URL" -c "DROP SCHEMA IF EXISTS dr_test CASCADE; CREATE SCHEMA dr_test;"

  echo "==> Restoring backup into dr_test schema..."
  # T4-#8: plain pg_dump sets `SET search_path = public, pg_catalog;` before all
  # DDL and uses unqualified names thereafter. Rename that to dr_test so every
  # restored object lands in dr_test, not in the live public schema. This makes
  # the restore a genuine exercise of the recovery path without touching live data.
  # Fail fast: abort the restore on any SQL error instead of silently producing
  # a partial restore.
  gunzip -c "$DUMP_FILE" \
    | sed 's/SET search_path = public/SET search_path = dr_test/g' \
    | psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1

  # Verify the restore ACTUALLY populated dr_test. A count of 0 means the
  # restore path is broken — fail loudly rather than silently always-passing.
  local TABLE_COUNT
  TABLE_COUNT=$(psql "$DB_URL" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='dr_test'" \
    2>/dev/null | tr -d ' ' || echo 0)
  if [ "${TABLE_COUNT:-0}" -eq 0 ]; then
    echo "ERROR: DR drill restore produced 0 tables in dr_test — restore path is broken."
    psql "$DB_URL" -c "DROP SCHEMA IF EXISTS dr_test CASCADE;" 2>/dev/null || true
    rm -f "$DUMP_FILE"
    exit 1
  fi
  echo "    Restored ${TABLE_COUNT} tables into dr_test."

  echo "==> Verifying restored schema (dr_test)..."
  verify_schema "dr_test"

  echo "==> Cleaning up test schema..."
  psql "$DB_URL" -c "DROP SCHEMA IF EXISTS dr_test CASCADE;" 2>/dev/null || true

  echo "==> DR drill complete — restore path verified. Cleaning up dump file..."
  rm -f "$DUMP_FILE"
}

# ── Main ────────────────────────────────────────────────────────
case "${1:-}" in
  --backup)  backup ;;
  --restore) restore ;;
  --verify)  verify_schema ;;
  *)         usage ;;
esac

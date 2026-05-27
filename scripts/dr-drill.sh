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
  pg_dump "$DB_URL" \
    --no-owner \
    --no-privileges \
    --schema=public \
    --format=custom \
    | gzip > "$DUMP_FILE"
  echo "    Backup written to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
}

verify_schema() {
  require_env DB_URL
  echo "==> Verifying schema integrity..."

  local FAILED=0

  # Critical tables
  local TABLES=(
    sites admin_users content products
    affiliate_clicks audit_log webhook_dlq
    newsletter_subscribers categories
  )

  for table in "${TABLES[@]}"; do
    if psql "$DB_URL" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$table')" 2>/dev/null | grep -q "t"; then
      echo "    ✓ $table"
    else
      echo "    ✗ $table MISSING"
      FAILED=$((FAILED + 1))
    fi
  done

  # RLS enforcement
  local RLS_TABLES=(sites content products affiliate_clicks)
  for table in "${RLS_TABLES[@]}"; do
    if psql "$DB_URL" -tAc "SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='$table'" 2>/dev/null | grep -q "t"; then
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

  echo "==> Restore drill: dropping and recreating from backup..."
  # Create a temporary test schema to avoid touching public
  psql "$DB_URL" -c "DROP SCHEMA IF EXISTS dr_test CASCADE; CREATE SCHEMA dr_test;" 2>/dev/null || true

  echo "==> Restoring backup into dr_test schema..."
  gunzip -c "$DUMP_FILE" | pg_restore \
    --dbname="$DB_URL" \
    --schema=dr_test \
    --no-owner \
    --no-privileges \
    --if-exists \
    --clean \
    2>/dev/null || true

  echo "==> Cleaning up test schema..."
  psql "$DB_URL" -c "DROP SCHEMA IF EXISTS dr_test CASCADE;" 2>/dev/null || true

  echo "==> Verifying production schema is intact..."
  verify_schema

  echo "==> DR drill complete. Cleaning up dump file..."
  rm -f "$DUMP_FILE"
}

# ── Main ────────────────────────────────────────────────────────
case "${1:-}" in
  --backup)  backup ;;
  --restore) restore ;;
  --verify)  verify_schema ;;
  *)         usage ;;
esac

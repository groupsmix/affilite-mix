#!/usr/bin/env bash
# scripts/rls-policy-dump.sh
#
# Missing artifact: Supabase schema dump including RLS policies.
#
# Produces a sanitized dump of:
#   1. All tables and their RLS status
#   2. All RLS policies (table, name, command, roles, qual)
#   3. All grants on public schema tables
#   4. All SECURITY DEFINER functions
#
# Output is suitable for the evidence pack (docs/evidence-pack.md).
# Contains NO data — only schema/policy metadata.
#
# Usage:
#   STAGING_SUPABASE_DB_URL=postgres://... bash scripts/rls-policy-dump.sh
#   # or
#   DATABASE_URL=postgres://... bash scripts/rls-policy-dump.sh > docs/ops/rls-dump.txt
set -euo pipefail

DB_URL="${STAGING_SUPABASE_DB_URL:-${SUPABASE_DB_POOLER_URL:-${DATABASE_URL:-}}}"

if [ -z "$DB_URL" ]; then
  echo "ERROR: No database URL set."
  echo "Set STAGING_SUPABASE_DB_URL, SUPABASE_DB_POOLER_URL, or DATABASE_URL."
  exit 1
fi

echo "=== Supabase RLS Policy Dump ==="
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Source: schema metadata only (no row data)"
echo ""

# ── 1. Tables and RLS status ──────────────────────────────────
echo "── 1. Tables and RLS Status ──"
psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname;
" | while IFS='|' read -r name enabled forced; do
  status="RLS=$([ "$enabled" = "t" ] && echo "ON" || echo "OFF")"
  force="FORCE=$([ "$forced" = "t" ] && echo "ON" || echo "OFF")"
  echo "  $name: $status $force"
done
echo ""

# ── 2. RLS Policies ──────────────────────────────────────────
echo "── 2. RLS Policies ──"
psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
" | while IFS='|' read -r schema table policy perm roles cmd qual withcheck; do
  echo "  $table.$policy:"
  echo "    command=$cmd permissive=$perm roles=$roles"
  echo "    qual=$qual"
  if [ -n "$withcheck" ] && [ "$withcheck" != "" ]; then
    echo "    with_check=$withcheck"
  fi
done
echo ""

# ── 3. Grants on public tables ───────────────────────────────
echo "── 3. Table Grants (public schema) ──"
psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
  SELECT grantee, table_name, privilege_type
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee NOT IN ('postgres', 'supabase_admin')
  ORDER BY grantee, table_name, privilege_type;
" | while IFS='|' read -r grantee table priv; do
  echo "  $grantee: $table ($priv)"
done
echo ""

# ── 4. SECURITY DEFINER functions ────────────────────────────
echo "── 4. SECURITY DEFINER Functions (public schema) ──"
psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -F'|' -c "
  SELECT p.proname, p.prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
  ORDER BY p.proname;
" | while IFS='|' read -r name secdef; do
  echo "  $name (SECURITY DEFINER)"
done
echo ""

# ── 5. Summary ───────────────────────────────────────────────
echo "── 5. Summary ──"
TOTAL_TABLES=$(psql "$DB_URL" -t -A -c "
  SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';
")
RLS_ENABLED=$(psql "$DB_URL" -t -A -c "
  SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;
")
RLS_DISABLED=$(psql "$DB_URL" -t -A -c "
  SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
")
POLICY_COUNT=$(psql "$DB_URL" -t -A -c "
  SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
")
echo "  Total tables: $TOTAL_TABLES"
echo "  RLS enabled: $RLS_ENABLED"
echo "  RLS disabled: $RLS_DISABLED"
echo "  Total policies: $POLICY_COUNT"

if [ "$RLS_DISABLED" -gt 0 ]; then
  echo ""
  echo "  WARNING: $RLS_DISABLED table(s) have RLS disabled!"
  echo "  Tables without RLS:"
  psql "$DB_URL" -t -A -c "
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
    ORDER BY c.relname;
  " | while read -r name; do
    echo "    - $name"
  done
fi

echo ""
echo "NOTE: This dump contains schema metadata only, no row data."
echo "Attach to the evidence pack (docs/evidence-pack.md section 1)."

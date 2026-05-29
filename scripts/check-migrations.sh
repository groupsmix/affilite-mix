#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-migrations.sh — epic E-2 + audit follow-ups G-CI-01 / G-CI-02
#
# Fails CI when a new Supabase migration introduces:
#
#   E-2  : a permissive RLS policy of the form `FOR ALL USING (true)`.
#          Such policies are the exact anti-pattern that 00055 hardened
#          away (service_role bypasses RLS so they work today, but
#          silently open up every role if RLS ever changes).
#
#   G-CI-01 : a CREATE POLICY whose `qual` or `with_check` references
#             `auth.uid()` / `auth.role()` / `auth.jwt()` /
#             `current_request_site_id*()` *outside* a `(select …)`
#             wrapper. Postgres re-evaluates these per row when not
#             wrapped, regressing the auth_rls_initplan optimisation
#             that 00082 enforced.
#
#   G-CI-02 : a `CREATE FUNCTION ... SECURITY DEFINER` block in
#             the public schema that does not declare
#             `SET search_path = …`. A mutable search_path on a
#             SECURITY DEFINER routine is a privilege-escalation
#             primitive (see audit S-08).
#
# Down-migrations are exempted — they intentionally restore the
# prior (often unsafe) state when reverting and are not auto-applied.
#
# Migrations 00064 / 00067 are exempted from the initplan rule because
# they pre-date 00082's hardening; 00082 itself rewrites everything
# they emit.
#
# Usage:
#   scripts/check-migrations.sh                 # defaults to supabase/migrations
#   scripts/check-migrations.sh path/to/dir     # custom directory
# ────────────────────────────────────────────────────────────

set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "check-migrations: directory not found: $MIGRATIONS_DIR" >&2
  exit 2
fi

# Migrations that pre-date the audit hardening and should NOT be
# rechecked by the initplan / search_path rules. The bare patterns in
# these files are fixed by their own up-migrations or by 00082 / 00083.
INITPLAN_LEGACY_RE='^(00064_tenant_isolation_rls|00067_harden_tenant_isolation_rls|00073_current_request_site_ids|00074_reintroduce_public_rls|00075_drop_legacy_public_select_policies|00076_deals_site_id_index|00078_tighten_unsafe_service_role_policies|00079_fix_service_role_policies_and_anon_insert|00082_rls_initplan_optimisation)\.sql$'

SECDEF_LEGACY_RE='^(00006_analytics_rpc|00026_reorder_pages_rpc|00027_dashboard_stats_rpc|00057_transactional_rpcs|00060_fix_reorder_pages_search_path|00070_atomic_stripe_event_apply|00077_purge_retention_function|00083_lock_security_definer_search_path|00085_extend_retention_purge)\.sql$'

# E-2 pattern.
USING_TRUE_RE="FOR[[:space:]]+ALL[[:space:]]+USING[[:space:]]*\([[:space:]]*true[[:space:]]*\)"

# Strip single-line SQL comments (-- …) before matching so comment
# prose inside the hardening migration or audit notes doesn't trip
# the check.  We intentionally do NOT strip /* … */ block comments —
# migrations don't use them and doing so in pure bash is brittle.
strip_sql_comments() {
  sed -E 's|--.*$||' "$1"
}

violations=0

while IFS= read -r -d '' file; do
  base="$(basename "$file")"

  # Skip down-migrations.
  case "$base" in
    *-down.sql) continue ;;
  esac

  body=$(strip_sql_comments "$file")

  # ── E-2 ─────────────────────────────────────────────────────────
  if echo "$body" | grep -qE "$USING_TRUE_RE"; then
    echo "::error file=$file::Migration contains 'FOR ALL USING (true)'. Scope the policy to a specific role (e.g. service_role) instead." >&2
    echo "$body" | grep -nE "$USING_TRUE_RE" >&2 || true
    violations=$((violations + 1))
  fi

  # ── G-CI-01 (initplan) ─────────────────────────────────────────
  # Find every CREATE POLICY block and check for bare auth.<x>() /
  # current_request_site_id*() inside its USING / WITH CHECK clauses.
  if [[ ! "$base" =~ $INITPLAN_LEGACY_RE ]] \
     && echo "$body" | grep -qiE 'CREATE[[:space:]]+POLICY'; then

    # Extract every CREATE POLICY ... ; statement (greedy up to the
    # next semicolon at end of line). Awk handles the multi-line case.
    policy_blocks=$(
      echo "$body" \
        | awk 'BEGIN{IGNORECASE=1; in_pol=0; buf=""} \
               { \
                 if (in_pol == 0 && match($0, /CREATE[[:space:]]+POLICY/)) { in_pol=1; buf=""; } \
                 if (in_pol == 1) { buf = buf " " $0; if ($0 ~ /;[[:space:]]*$/) { print buf; in_pol=0; buf=""; } } \
               }'
    )

    if [ -n "$policy_blocks" ]; then
      # Bare auth.<x>() not preceded by `select ` (perl is ubiquitous
      # on GitHub runners; bash regex doesn't support look-behind).
      if echo "$policy_blocks" \
           | perl -ne 'exit 1 if /(?<!select )\bauth\.\w+\(\)/i; END{exit 0}' \
           ; then : ; else
        echo "::error file=$file::Migration creates a policy with a bare auth.<x>() call. Wrap as (select auth.<x>()) — see audit follow-up G-CI-01 / migration 00082." >&2
        violations=$((violations + 1))
      fi

      if echo "$policy_blocks" \
           | perl -ne 'exit 1 if /(?<!select )\bcurrent_request_site_ids?\(\)/i; END{exit 0}' \
           ; then : ; else
        echo "::error file=$file::Migration creates a policy with a bare current_request_site_id() call. Wrap as (select current_request_site_id()) — see audit follow-up G-CI-01 / migration 00082." >&2
        violations=$((violations + 1))
      fi
    fi
  fi

  # ── G-CI-02 (security definer search_path) ─────────────────────
  if [[ ! "$base" =~ $SECDEF_LEGACY_RE ]] \
     && echo "$body" | grep -qiE 'SECURITY[[:space:]]+DEFINER'; then

    # For each CREATE FUNCTION ... SECURITY DEFINER ... block, ensure
    # there is a `SET search_path = ...` clause within the same block.
    # We approximate "block" as the lines from CREATE FUNCTION up to
    # AS $$ (or AS $func$ etc.) — which is where SET clauses must
    # appear in PostgreSQL grammar.
    func_blocks=$(
      echo "$body" \
        | awk 'BEGIN{IGNORECASE=1; in_fn=0; buf=""} \
               { \
                 if (in_fn == 0 && match($0, /CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION/)) { in_fn=1; buf=""; } \
                 if (in_fn == 1) { buf = buf " " $0; if (match($0, /\bAS[[:space:]]*\$/)) { print buf; in_fn=0; buf=""; } } \
               }'
    )

    if [ -n "$func_blocks" ]; then
      # For every block flagged SECURITY DEFINER, require a SET
      # search_path = … clause.
      offending=$(
        echo "$func_blocks" \
          | tr -d '\r' \
          | grep -iE 'SECURITY[[:space:]]+DEFINER' \
          | grep -ivE 'SET[[:space:]]+search_path[[:space:]]*=' \
          || true
      )
      if [ -n "$offending" ]; then
        echo "::error file=$file::Migration declares a SECURITY DEFINER function without 'SET search_path = ...'. Pin search_path explicitly to prevent privesc — see audit S-08 / G-CI-02." >&2
        violations=$((violations + 1))
      fi
    fi
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' -print0 | sort -z)

# ── F7: Enforce RLS + anon revoke for every CREATE TABLE ──────────
# Every new table must ship with ENABLE ROW LEVEL SECURITY and
# REVOKE ... FROM anon in the same migration file. Without this,
# Supabase's default `GRANT ALL ... TO anon` leaves the table
# wide-open until the next sweep migration.
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  case "$base" in
    *-down.sql) continue ;;
  esac

  body_f7=$(strip_sql_comments "$file")

  # Only check files that CREATE TABLE.
  if echo "$body_f7" | grep -qiE 'CREATE[[:space:]]+TABLE'; then
    if ! echo "$body_f7" | grep -qiE 'ENABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY'; then
      echo "::error file=$file::Migration creates a table without ENABLE ROW LEVEL SECURITY. Add it in the same file — see audit F7." >&2
      violations=$((violations + 1))
    fi
    if ! echo "$body_f7" | grep -qiE 'REVOKE[[:space:]].*FROM[[:space:]]+anon'; then
      echo "::error file=$file::Migration creates a table without REVOKE ... FROM anon. Revoke default anon grants in the same file — see audit F7." >&2
      violations=$((violations + 1))
    fi
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' -print0 | sort -z)

# ── ETAP1-07: Enforce -down.sql existence for every up-migration ──
missing_down=0
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  case "$base" in
    *-down.sql) continue ;;
  esac
  down_file="${file%.sql}-down.sql"
  if [ ! -f "$down_file" ]; then
    echo "::error file=$file::Up-migration has no matching -down.sql rollback file." >&2
    missing_down=$((missing_down + 1))
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' -print0 | sort -z)

if [ "$missing_down" -gt 0 ]; then
  echo "check-migrations: $missing_down migration(s) missing -down.sql rollback." >&2
  violations=$((violations + missing_down))
fi

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "check-migrations: $violations violation(s)." >&2
  echo "Recommended patterns:" >&2
  echo "  CREATE POLICY \"...\" ON <table>" >&2
  echo "    FOR ALL TO service_role" >&2
  echo "    USING ((select auth.role()) = 'service_role')" >&2
  echo "    WITH CHECK ((select auth.role()) = 'service_role');" >&2
  echo "" >&2
  echo "  CREATE OR REPLACE FUNCTION public.f(...)" >&2
  echo "    RETURNS ... LANGUAGE plpgsql SECURITY DEFINER" >&2
  echo "    SET search_path = pg_catalog, public" >&2
  echo "    AS \$\$ ... \$\$;" >&2
  exit 1
fi

echo "check-migrations: OK — no FOR ALL USING (true), bare auth.<x>(), unpinned SECURITY DEFINER functions, or missing -down.sql."

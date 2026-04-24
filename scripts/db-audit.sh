#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/db-audit.sh — epic E-6
#
# Runs the RLS/anon-grant audit queries from
# docs/public-rls-inventory.md against a live (staging) Supabase
# database and exits non-zero if unexpected policies or grants
# are found.
#
# Invariants enforced (see docs/public-rls-inventory.md):
#
#   A. The `anon` role must hold NO table privileges (SELECT,
#      INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on
#      ANY public-schema table.
#
#   B. No RLS policy on a public-schema table may grant access to
#      the `anon` role via its `roles` array.
#
#   C. No RLS policy on a public-schema table may use the pattern
#      `FOR ALL USING (true)` without scoping `qual` to
#      `service_role`. This complements the static check in
#      scripts/check-migrations.sh by catching drift between the
#      migration history and the live DB.
#
# Usage (local):
#   DATABASE_URL=postgres://… ./scripts/db-audit.sh
#   STAGING_SUPABASE_DB_URL=postgres://… ./scripts/db-audit.sh
#   SUPABASE_DB_POOLER_URL=postgres://… ./scripts/db-audit.sh
#
# Usage (CI — see .github/workflows/ci.yml "RLS audit (E-6)" job):
#   Gated on STAGING_SUPABASE_DB_URL being set as a repo secret.
#   Skipped with a warning when no DB URL is available.
#
# Safety: the script only runs SELECTs. It NEVER writes to the DB.
# ────────────────────────────────────────────────────────────

set -euo pipefail

# Pick the first available DB URL, preferring staging/pooler over any
# plain DATABASE_URL to reduce the risk of ever pointing this at prod.
DB_URL="${STAGING_SUPABASE_DB_URL:-${SUPABASE_DB_POOLER_URL:-${DATABASE_URL:-}}}"

if [ -z "$DB_URL" ]; then
  echo "db-audit: no DB URL configured (STAGING_SUPABASE_DB_URL, SUPABASE_DB_POOLER_URL, or DATABASE_URL)."
  echo "db-audit: skipping — set one of these to run the audit."
  # Exit code 0 when skipped so CI can gate on secrets without failing.
  # The CI job decides whether a skip is acceptable via the STAGING_*
  # repo secret being set.
  exit 0
fi

# Absolute refusal to touch anything that looks like prod. We don't
# know the prod URL from here, but we can reject plainly-named prod
# hosts as a defence-in-depth guard. Run this before the psql check
# so a mis-pointed URL is rejected even if the runner is missing psql.
case "$DB_URL" in
  *prod*|*production*)
    echo "::error::db-audit: refusing to run against a DB URL containing 'prod'/'production' — this script is read-only but should only run against staging." >&2
    exit 2
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "::error::db-audit: psql is not installed. Install postgresql-client before running this script." >&2
  exit 2
fi

echo "db-audit: connecting to DB and running audit queries…"

# Common psql flags:
#   -X   don't read ~/.psqlrc
#   -A   unaligned output (one column per line, easier to grep)
#   -t   tuples only (no header/footer)
#   -v ON_ERROR_STOP=1   fail fast if the server returns an error
PSQL="psql -X -A -t -v ON_ERROR_STOP=1 $DB_URL"

violations=0

# ── Invariant A: anon role has NO grants on public-schema tables ────
echo ""
echo "▶ [A] Checking for any anon-role grants on public-schema tables…"
anon_grants=$($PSQL <<'SQL'
SELECT table_schema || '.' || table_name || ' → ' || privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;
SQL
)

if [ -n "$anon_grants" ]; then
  echo "::error::db-audit: [A] anon role has unexpected grants on public-schema tables:" >&2
  while IFS= read -r line; do
    [ -n "$line" ] && echo "  • $line" >&2
  done <<< "$anon_grants"
  violations=$((violations + 1))
else
  echo "  ok — anon role holds no public-schema table grants."
fi

# ── Invariant B: no RLS policy may target the anon role ─────────────
echo ""
echo "▶ [B] Checking for RLS policies that include 'anon' in their roles array…"
anon_policies=$($PSQL <<'SQL'
SELECT schemaname || '.' || tablename || ' → ' || policyname || ' (cmd=' || cmd || ', roles=' || array_to_string(roles, ',') || ')'
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;
SQL
)

if [ -n "$anon_policies" ]; then
  echo "::error::db-audit: [B] RLS policies grant access to the anon role:" >&2
  while IFS= read -r line; do
    [ -n "$line" ] && echo "  • $line" >&2
  done <<< "$anon_policies"
  violations=$((violations + 1))
else
  echo "  ok — no public-schema RLS policy targets the anon role."
fi

# ── Invariant C: no 'FOR ALL USING (true)' drift in the live DB ─────
echo ""
echo "▶ [C] Checking for permissive 'FOR ALL' policies (qual=true, no service_role guard)…"
permissive_policies=$($PSQL <<'SQL'
SELECT schemaname || '.' || tablename || ' → ' || policyname || ' (cmd=' || cmd || ', qual=' || COALESCE(qual, '<null>') || ')'
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'ALL'
  AND (qual IS NULL OR qual = 'true')
  AND NOT (
    -- service_role-scoped policies set qual via auth.role() = 'service_role'
    COALESCE(qual, '') ILIKE '%service_role%'
    OR COALESCE(with_check, '') ILIKE '%service_role%'
  )
  AND NOT ('service_role' = ANY(roles))
ORDER BY tablename, policyname;
SQL
)

if [ -n "$permissive_policies" ]; then
  echo "::error::db-audit: [C] RLS policies use 'FOR ALL USING (true)' without a service_role scope:" >&2
  while IFS= read -r line; do
    [ -n "$line" ] && echo "  • $line" >&2
  done <<< "$permissive_policies"
  violations=$((violations + 1))
else
  echo "  ok — no permissive 'FOR ALL' policies without a service_role guard."
fi

echo ""
if [ "$violations" -gt 0 ]; then
  echo "::error::db-audit: FAILED — $violations invariant(s) violated. See messages above." >&2
  echo "See docs/public-rls-inventory.md for the expected state." >&2
  exit 1
fi

echo "db-audit: OK — all invariants hold."

#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-migrations.sh — epic E-2
#
# Fail CI when a Supabase migration introduces a permissive RLS
# policy of the form `FOR ALL USING (true)`.  Such policies are
# the exact anti-pattern the E-1 / 00055 migration hardens away
# (service_role bypasses RLS so they work today, but silently
# open up every role if RLS ever changes).
#
# Known-legacy migrations that already contain the pattern are
# allow-listed here.  The allow-list is intentionally stored in
# this script (not a separate dotfile) so reviewers see it in
# the diff when it changes.
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

# Historical migrations that pre-date the E-1 hardening migration
# (00055_harden_remaining_rls.sql).  These are left untouched so the
# migration history remains append-only; the hardening migration
# drops and recreates each policy with a service_role scope.
LEGACY_FILES=(
  "00046_price_snapshots_and_alerts.sql"
  "00047_quiz_funnel.sql"
  "00048_commissions_and_epc.sql"
  "00049_deals.sql"
  "00050_community_ugc.sql"
  "00051_memberships.sql"
  "00052_ab_testing_and_review_state.sql"
)

is_legacy() {
  local base="$1"
  for legacy in "${LEGACY_FILES[@]}"; do
    if [ "$base" = "$legacy" ]; then
      return 0
    fi
  done
  return 1
}

PATTERN="FOR[[:space:]]+ALL[[:space:]]+USING[[:space:]]*\([[:space:]]*true[[:space:]]*\)"

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
  if strip_sql_comments "$file" | grep -qE "$PATTERN"; then
    if is_legacy "$base"; then
      continue
    fi
    echo "::error file=$file::Migration contains 'FOR ALL USING (true)'. Scope the policy to a specific role (e.g. service_role) instead." >&2
    strip_sql_comments "$file" | grep -nE "$PATTERN" >&2 || true
    violations=$((violations + 1))
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' -print0 | sort -z)

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "check-migrations: $violations migration(s) contain the forbidden 'FOR ALL USING (true)' pattern." >&2
  echo "Recommended pattern:" >&2
  echo "  CREATE POLICY \"...\" ON <table>" >&2
  echo "    FOR ALL TO service_role" >&2
  echo "    USING (auth.role() = 'service_role')" >&2
  echo "    WITH CHECK (auth.role() = 'service_role');" >&2
  exit 1
fi

echo "check-migrations: OK — no new 'FOR ALL USING (true)' policies."

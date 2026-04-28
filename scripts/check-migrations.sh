#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-migrations.sh — epic E-2 / F-006
#
# Fail CI when a Supabase migration introduces a permissive RLS
# policy of the form `FOR ALL USING (true)`.  Such policies are
# the exact anti-pattern that can expose admin_users password hashes
# to all authenticated users (see 00064/00067 migration history).
#
# F-006: This check is now UNCONDITIONAL — no legacy allow-list.
# Any migration with FOR ALL USING (true) fails the build, period.
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

# F-006: Also check for TO authenticated combined with USING (true)
# which is the pattern that shipped in 00064 and was fixed in 00067
PATTERN_FOR_ALL="FOR[[:space:]]+ALL[[:space:]]+USING[[:space:]]*\([[:space:]]*true[[:space:]]*\)"
PATTERN_AUTH_TRUE="TO[[:space:]]+authenticated.*USING[[:space:]]*\([[:space:]]*true[[:space:]]*\)"
PATTERN_ROLE_TRUE="auth\.role\(\)[[:space:]]*=[[:space:]]*'authenticated'.*USING[[:space:]]*\([[:space:]]*true[[:space:]]*\)"

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
  stripped=$(strip_sql_comments "$file")

  # Check for FOR ALL USING (true) - unconditional failure
  if echo "$stripped" | grep -qE "$PATTERN_FOR_ALL"; then
    echo "::error file=$file::F-006: Migration contains 'FOR ALL USING (true)'. This pattern is forbidden in all migrations." >&2
    echo "$stripped" | grep -nE "$PATTERN_FOR_ALL" >&2 || true
    violations=$((violations + 1))
  fi

  # Check for TO authenticated USING (true) - the 00064 pattern
  if echo "$stripped" | grep -qE "$PATTERN_AUTH_TRUE"; then
    echo "::error file=$file::F-006: Migration contains 'TO authenticated ... USING (true)'. This exposes data to all authenticated users." >&2
    echo "$stripped" | grep -nE "$PATTERN_AUTH_TRUE" >&2 || true
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

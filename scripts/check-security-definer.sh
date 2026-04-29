#!/usr/bin/env bash
# DB-03: CI gate against unpinned SECURITY DEFINER functions.
#
# Scans every up-migration in supabase/migrations/*.sql and fails the
# build if SECURITY DEFINER is present without SET search_path in the
# same file. This prevents CVE-2018-1058 from being reintroduced via
# new migrations.
#
# Legacy migrations that were fixed by later migrations are excluded
# via an allowlist. The script only blocks NEW violations.
#
# Usage: scripts/check-security-definer.sh
# Exit code: 0 if all SECURITY DEFINER functions have SET search_path,
#            1 if any are missing it.

set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
EXIT_CODE=0

# Legacy migrations whose SECURITY DEFINER functions were fixed by
# later migrations. These are kept in the allowlist so the gate only
# fires on new violations.
LEGACY_ALLOWLIST=(
  "00026_reorder_pages_rpc.sql"       # Fixed by 00060_fix_reorder_pages_search_path.sql
  "00077_purge_retention_function.sql" # Fixed by 00081_fix_purge_retention_search_path.sql
)

is_allowlisted() {
  local basename
  basename=$(basename "$1")
  for allowed in "${LEGACY_ALLOWLIST[@]}"; do
    if [[ "$basename" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

for file in "$MIGRATIONS_DIR"/*.sql; do
  # Skip down migrations
  [[ "$file" == *"-down.sql" ]] && continue

  # Skip legacy allowlisted files
  if is_allowlisted "$file"; then
    continue
  fi

  # Check if file contains SECURITY DEFINER without SET search_path
  if grep -qi 'SECURITY DEFINER' "$file"; then
    if ! grep -qi 'SET search_path' "$file"; then
      echo "ERROR: $file contains SECURITY DEFINER without SET search_path"
      EXIT_CODE=1
    fi
  fi
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "OK: All SECURITY DEFINER functions have SET search_path pinned."
else
  echo ""
  echo "FAILED: One or more migrations declare SECURITY DEFINER without"
  echo "SET search_path. This is a CVE-2018-1058 risk. Fix by adding:"
  echo "  SET search_path = public, pg_temp"
  echo "to the function declaration."
fi

exit $EXIT_CODE

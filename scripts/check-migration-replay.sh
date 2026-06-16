#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-migration-replay.sh — F-14: Validate up/down migration replay
#
# Fails CI when:
#   1. An up-migration exists without a corresponding down-migration
#   2. A down-migration is empty or contains only comments
#   3. Migration naming convention is inconsistent
#
# This ensures every migration can be safely rolled back, which is
# critical for production incident response and DR testing.
#
# Usage:
#   scripts/check-migration-replay.sh                # defaults to supabase/migrations
#   scripts/check-migration-replay.sh path/to/dir    # custom directory
# ────────────────────────────────────────────────────────────

set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"
# Down-migrations live in a sibling directory so the Supabase CLI / branching
# preview scanner (which globs supabase/migrations/*.sql and keys
# schema_migrations on the filename prefix) never sees them — otherwise
# NNNNN_x.sql and NNNNN_x-down.sql collide on the same version key. See the
# "Run migrations up" step in .github/workflows/ci.yml for the same rationale.
DOWN_DIR="${2:-supabase/migrations-down}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "check-migration-replay: directory not found: $MIGRATIONS_DIR" >&2
  exit 2
fi

violations=0
checked_migrations=0

echo "=== F-14: Checking migration replay capability ==="
echo "Scanning directory: $MIGRATIONS_DIR"
echo ""

# Track which up-migrations have down-migrations
declare -a missing_downs
declare -a empty_downs
declare -a naming_issues

while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  
  # Skip down-migrations for now - we'll process up-migrations and check for their down counterparts
  case "$base" in
    *-down.sql) continue ;;
    *-down.sql.sh) continue ;;
    *down.sql) continue ;;  # Handle variations
  esac

  # Only process .sql files
  case "$base" in
    *.sql) ;;
    *) continue ;;
  esac

  checked_migrations=$((checked_migrations + 1))

  # Determine the expected down-migration filename in the sibling DOWN_DIR.
  # Common patterns:
  #   supabase/migrations/00001_initial_schema.sql
  #     -> supabase/migrations-down/00001_initial_schema-down.sql
  down_file="$DOWN_DIR/$(basename "${file%.sql}")-down.sql"
  
  if [ ! -f "$down_file" ]; then
    missing_downs+=("$base")
    violations=$((violations + 1))
    echo "::warning file=$file::Migration lacks down-migration. Expected: $(basename "$down_file")" >&2
  else
    # Check if down-migration is empty or contains only comments
    body=$(cat "$down_file")
    
    # Remove comments and whitespace
    cleaned=$(echo "$body" | sed -E 's/--.*$//' | sed -E 's|/\*.*\*/||' | tr -d '[:space:]')
    
    if [ -z "$cleaned" ]; then
      empty_downs+=("$(basename "$down_file")")
      violations=$((violations + 1))
      echo "::error file=$down_file::Down-migration is empty or contains only comments. Each migration must have a reversible down-migration." >&2
    fi
  fi

  # Check naming convention - should match pattern: [timestamp]_[description].sql
  # or: [number]_[description].sql
  if [[ ! "$base" =~ ^[0-9]{14}_[^.]+\.sql$ ]] && [[ ! "$base" =~ ^[0-9]{5}_[^.]+\.sql$ ]]; then
    naming_issues+=("$base")
    violations=$((violations + 1))
    echo "::warning file=$file::Migration filename does not match expected pattern (TIMESTAMP_description.sql or NUMBER_description.sql)" >&2
  fi

done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' -print0 | sort -z)

# Summary
echo ""
echo "=== Migration Replay Check Summary ==="
echo "Checked: $checked_migrations up-migrations"

if [ ${#missing_downs[@]} -gt 0 ]; then
  echo ""
  echo "❌ Missing down-migrations (${#missing_downs[@]}):"
  for mig in "${missing_downs[@]}"; do
    echo "   - $mig"
  done
fi

if [ ${#empty_downs[@]} -gt 0 ]; then
  echo ""
  echo "❌ Empty down-migrations (${#empty_downs[@]}):"
  for mig in "${empty_downs[@]}"; do
    echo "   - $mig"
  done
fi

if [ ${#naming_issues[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  Naming convention issues (${#naming_issues[@]}):"
  for mig in "${naming_issues[@]}"; do
    echo "   - $mig"
  done
fi

if [ $violations -eq 0 ]; then
  echo "✓ All migrations have valid down-migrations"
  echo "✓ Migration replay capability verified"
  exit 0
else
  echo ""
  echo "::error::F-14: Migration replay check failed with $violations violation(s)" >&2
  echo "Fix: Add down-migrations or populate empty down-migration files" >&2
  echo "See docs/runbooks/migration-rollback.md for guidance" >&2
  exit 1
fi
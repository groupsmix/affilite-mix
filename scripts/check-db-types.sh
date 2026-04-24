#!/usr/bin/env bash
# scripts/check-db-types.sh
#
# CI check (E-5): regenerate types/supabase.ts from the staging DB and
# fail if the checked-in file has drifted from the live schema.
#
# Usage:
#   STAGING_SUPABASE_DB_URL="postgresql://..." bash scripts/check-db-types.sh
#
# When STAGING_SUPABASE_DB_URL is unset (fork PRs, local without creds)
# the script exits 0 with a warning so CI stays green while still
# surfacing the skip in logs.
set -euo pipefail

if [ -z "${STAGING_SUPABASE_DB_URL:-}" ]; then
  echo "⚠  STAGING_SUPABASE_DB_URL not set — skipping DB type drift check."
  echo "   Set the secret in your repo to enable this gate."
  exit 0
fi

# Ensure supabase CLI is available
if ! command -v supabase &>/dev/null; then
  echo "▶ Installing Supabase CLI..."
  npm i -g supabase@latest
fi

TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

echo "▶ Regenerating types/supabase.ts from staging DB..."
supabase gen types typescript --db-url "$STAGING_SUPABASE_DB_URL" > "$TMPFILE"

echo "▶ Comparing with checked-in types/supabase.ts..."
if ! diff -u types/supabase.ts "$TMPFILE"; then
  echo ""
  echo "❌ DB type drift detected."
  echo "   types/supabase.ts does not match the live staging schema."
  echo ""
  echo "   To fix: run locally against your staging DB:"
  echo "     supabase gen types typescript --db-url \"\$STAGING_SUPABASE_DB_URL\" > types/supabase.ts"
  echo "   Then commit the result."
  exit 1
fi

echo "✅ No drift — types/supabase.ts matches the staging DB schema."

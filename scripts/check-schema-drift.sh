#!/usr/bin/env bash
# scripts/check-schema-drift.sh
#
# Regenerates supabase/schema.sql and types/database.ts from the live linked
# Supabase project and exits non-zero if they differ from what is checked in.
#
# Usage (local):
#   ./scripts/check-schema-drift.sh
#
# Usage (CI — add as a job step after migrations are applied):
#   - name: Check schema/types drift
#     run: bash scripts/check-schema-drift.sh
#
# Prerequisites:
#   supabase CLI installed and logged in (`supabase login`)
#   Project linked (`supabase link --project-ref <ref>`)
#
set -euo pipefail

echo "▶ Dumping live schema..."
supabase db dump --linked > supabase/schema.sql

echo "▶ Regenerating TypeScript types..."
supabase gen types typescript --linked > types/database.ts

echo "▶ Checking for drift..."
if ! git diff --exit-code supabase/schema.sql types/database.ts; then
  echo ""
  echo "❌ Schema drift detected."
  echo "   supabase/schema.sql or types/database.ts are out of sync with the live DB."
  echo "   Run this script locally, review the diff, commit the regenerated files, and re-run CI."
  exit 1
fi

echo "✅ No drift — schema.sql and database.ts match the live DB."

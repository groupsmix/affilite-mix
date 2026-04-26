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
  # N-005: skip-with-success is only acceptable for fork PRs that cannot
  # reach the staging secret. Trusted branches (main pushes, internal PRs)
  # MUST run this gate — set REQUIRE_STAGING_DB=true in CI for those
  # contexts so the missing secret is a hard error instead of silent green.
  if [ "${REQUIRE_STAGING_DB:-false}" = "true" ]; then
    echo "::error::STAGING_SUPABASE_DB_URL is required on protected branches / non-fork PRs."
    echo "::error::Add it in GitHub → Settings → Secrets and variables → Actions."
    echo "::error::(Fork PRs can run this job in skip-green mode by leaving REQUIRE_STAGING_DB unset.)"
    exit 1
  fi
  echo "⚠  STAGING_SUPABASE_DB_URL not set — skipping DB type drift check (REQUIRE_STAGING_DB!=true)."
  echo "   Set the secret in your repo to enable this gate."
  exit 0
fi

# Ensure supabase CLI is available. Global npm install is explicitly
# blocked by the supabase CLI's postinstall script — install via one of
# the supported package managers instead.
# See: https://github.com/supabase/cli#install-the-cli
if ! command -v supabase &>/dev/null; then
  echo "❌ supabase CLI not found on PATH."
  echo "   Install it via one of the supported methods:"
  echo "     • macOS:  brew install supabase/tap/supabase"
  echo "     • Linux:  see https://github.com/supabase/cli#install-the-cli"
  echo "     • CI:     use the supabase/setup-cli@v1 GitHub Action"
  exit 1
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

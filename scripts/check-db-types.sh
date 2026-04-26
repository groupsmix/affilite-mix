#!/usr/bin/env bash
# scripts/check-db-types.sh
#
# CI check (E-5): structural one-way drift check between the live
# staging DB schema and types/supabase.ts.
#
# Implementation lives in scripts/check-db-types.mjs. This shell
# wrapper exists for backwards compatibility with .github/workflows/ci.yml,
# which calls `bash scripts/check-db-types.sh`.
#
# Usage:
#   STAGING_SUPABASE_DB_URL="postgresql://..." bash scripts/check-db-types.sh
#   SUPABASE_DB_POOLER_URL="postgresql://..."   bash scripts/check-db-types.sh
#
# DB URL resolution (matches scripts/db-audit.sh):
#   STAGING_SUPABASE_DB_URL > SUPABASE_DB_POOLER_URL > DATABASE_URL.
# The pooler URL is preferred from GitHub-hosted runners because
# Supabase direct hostnames (db.<ref>.supabase.co) only resolve over
# IPv6, which the runners cannot reach.
#
# Gating policy (N-005): trusted contexts (main pushes, internal PRs)
# set REQUIRE_STAGING_DB=true so missing secrets fail loudly; fork PRs
# fall through to skip-green inside the Node script.
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql not found on PATH. Install postgresql-client first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ node not found on PATH."
  exit 1
fi

exec node scripts/check-db-types.mjs

#!/usr/bin/env bash
#
# Integration-test gate (audit P0-1 / P1-2).
#
# The "Integration tests" job is a required check. Previously it ran with a
# placeholder Supabase URL and no TEST_WITH_SUPABASE opt-in, so every real
# backend/RLS suite skipped and the job reported success while executing zero
# database assertions. This wrapper makes the gate fail-closed:
#
#   * If staging Supabase secrets are configured, run the integration suite
#     against them and enforce an executed-count floor plus mandatory RLS
#     execution (no all-skipped green).
#   * If they are absent in a TRUSTED context (push / same-repo PR), fail with
#     an explicit message naming the missing configuration.
#   * If they are absent in an UNTRUSTED context (fork PR — secrets are
#     unavailable by design), skip green with a visible warning.
#
# Local opt-out: developers run `npm run test:integration` directly. Without
# TEST_WITH_SUPABASE + a real URL the suites skip cleanly and this gate is not
# invoked, so local `npm test`/`npm run test:integration` stay green offline.
set -euo pipefail

URL="${STAGING_SUPABASE_URL:-}"
ANON="${STAGING_SUPABASE_ANON_KEY:-}"
SERVICE_ROLE="${STAGING_SUPABASE_SERVICE_ROLE_KEY:-}"

configured=false
if [ -n "$URL" ] && [ -n "$SERVICE_ROLE" ] && ! printf '%s' "$URL" | grep -qi "placeholder"; then
  configured=true
fi

if [ "$configured" != "true" ]; then
  if [ "${REQUIRE_STAGING_SUPABASE:-false}" = "true" ]; then
    echo "::error::Integration gate fail-closed: real Supabase integration/RLS tests cannot run because staging secrets are missing in a trusted context."
    echo "::error::Configure STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY and STAGING_SUPABASE_SERVICE_ROLE_KEY (isolated staging project, never production)."
    echo "::error::See docs/test-gate-integrity.md for the required repository secrets and branch-protection steps."
    exit 1
  fi
  echo "::warning::Integration tests skipped — no staging Supabase secrets available (untrusted/fork context). Real execution is enforced only in trusted contexts."
  {
    echo "### Integration tests: skipped"
    echo "No staging Supabase secrets in this (untrusted) context. The trusted-context gate enforces real execution."
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

echo "Staging Supabase configured — running integration suite against staging."
export TEST_WITH_SUPABASE=1
export NEXT_PUBLIC_SUPABASE_URL="$URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE"

# `|| true` so a test failure still lets the execution gate run and surface a
# precise diagnostic; the gate re-fails on any non-passing outcome below.
set +e
npm run test:integration -- --reporter=default --reporter=json --outputFile=integration-report.json
TEST_EXIT=$?
set -e

node scripts/ci/check-test-execution.mjs \
  --vitest integration-report.json \
  --min-executed "${INTEGRATION_MIN_EXECUTED:-40}" \
  --require-suite "rls-isolation.integration"

if [ "$TEST_EXIT" -ne 0 ]; then
  echo "::error::Integration test run reported failures (exit ${TEST_EXIT})."
  exit "$TEST_EXIT"
fi

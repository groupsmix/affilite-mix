#!/usr/bin/env bash
#
# E2E execution & skip-honesty gate (audit P1-1 / P1-2).
#
# A green Playwright job is not proof that user journeys ran: specs call
# `test.skip()` dynamically when the backend/tenant/auth is not provisioned, so
# a job can be green while every authenticated or backend-dependent test is
# silently skipped. This wrapper enforces that:
#
#   * a minimum number of E2E tests actually executed (no hollow green), and
#   * every skip is covered by a reviewed allow-list; any new/unexpected skip
#     fails the gate.
#
# When admin auth is NOT provisioned (E2E_ADMIN_AUTH_PROVISIONED != "true") the
# authenticated-admin skips are additionally allowed, and a visible warning is
# emitted. Provisioning a staging admin storage state (see
# docs/test-gate-integrity.md) flips E2E_ADMIN_AUTH_PROVISIONED=true and makes
# those journeys non-skippable.
set -euo pipefail

REPORT="${E2E_REPORT:-playwright-report/results.json}"

ALLOW_ARGS=(--allow-skip-file scripts/ci/e2e-allowed-skips.json)
if [ "${E2E_ADMIN_AUTH_PROVISIONED:-false}" != "true" ]; then
  echo "::warning::E2E admin auth not provisioned — authenticated admin journeys may skip. Provision a staging admin storage state (docs/test-gate-integrity.md) to make them non-skippable."
  ALLOW_ARGS+=(--allow-skip-file scripts/ci/e2e-allowed-skips-unauthenticated.json)
fi

node scripts/ci/check-test-execution.mjs \
  --playwright "$REPORT" \
  --min-executed "${E2E_MIN_EXECUTED:-8}" \
  "${ALLOW_ARGS[@]}"

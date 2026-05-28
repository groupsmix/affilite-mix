#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
# scripts/check-env-docs.sh — epic G-13
#
# Fail CI when an env var the application reads at runtime is
# missing from `.env.example`. The audit (G-13) found 13 vars
# documented only in code comments / CI workflows but not in
# the canonical example file, so operators provisioning a new
# environment had no single source of truth.
#
# This guard pins the *required-to-be-documented* list in the
# script itself (intentionally — reviewers see additions in the
# PR diff) and asserts each name has a `^NAME=` line in
# .env.example. A blank value is fine; the line exists so
# `grep` and `direnv`-style tooling can discover it.
#
# Usage:
#   scripts/check-env-docs.sh                  # uses ./.env.example
#   scripts/check-env-docs.sh path/to/.env     # custom file
# ────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE="${1:-.env.example}"

if [ ! -f "$ENV_FILE" ]; then
  echo "check-env-docs: file not found: $ENV_FILE" >&2
  exit 2
fi

# The list of env vars that MUST be documented in .env.example.
# Add new entries here when introducing a new env var that has
# operational consequences in production. Sort alphabetically so
# diffs are minimal.
REQUIRED_VARS=(
  ADMIN_SESSION_STRICT
  AFFILIATE_ALLOWED_DOMAINS
  AFFILIATE_DOMAIN_ENFORCEMENT
  AI_MAX_PROMPT_CHARS
  CRON_ALLOW_SHARED_FALLBACK_IN_PROD
  GDPR_HASH_SECRET
  HEALTH_DETAIL_BEARER
  INTERNAL_HMAC_MIGRATION_MODE
  JWT_SECRET_CURRENT
  JWT_SECRET_PREVIOUS
  LOG_SHIPPER_ENABLED
  OTEL_AUTH_TOKEN
  OTEL_ENDPOINT
  OUTBOUND_ALLOWED_HOSTNAMES
  RATE_LIMIT_FORCE_CLOSED
  RATE_LIMIT_KV_GRACE_MS
)

missing=()
for var in "${REQUIRED_VARS[@]}"; do
  # Match `NAME=` at the start of a line (non-comment). A blank value
  # is fine — operators just need to see the key exists.
  if ! grep -qE "^${var}=" "$ENV_FILE"; then
    missing+=("$var")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error::check-env-docs: ${#missing[@]} env var(s) missing from ${ENV_FILE}:" >&2
  for var in "${missing[@]}"; do
    echo "  - $var" >&2
  done
  echo >&2
  echo "Add a documented stub (with a comment block explaining the var)" >&2
  echo "to ${ENV_FILE}. See scripts/check-env-docs.sh for the full list." >&2
  exit 1
fi

echo "check-env-docs: all ${#REQUIRED_VARS[@]} required env vars are documented in ${ENV_FILE}."

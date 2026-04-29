#!/usr/bin/env bash
# CF-05: Deploy-time preflight for Cloudflare bindings.
#
# Asserts that required KV/DO/R2/Queue/Secret bindings exist before
# the deploy succeeds. Run this after `wrangler deploy` in CI.
#
# Usage: ./scripts/deploy-preflight.sh
#
# Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID env vars

set -euo pipefail

SCRIPT_NAME="affilite-mix"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"

echo "=== CF-05: Deploy Preflight Check ==="
echo "Checking Worker bindings for script: ${SCRIPT_NAME}"

# Fetch Worker bindings
BINDINGS=$(curl -sf \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/bindings" \
  2>/dev/null || echo '{"result":[]}')

# Required bindings (from wrangler.jsonc)
REQUIRED_KV=("APP_CACHE_KV" "RATE_LIMIT_KV")
REQUIRED_DO=("RATE_LIMITER_DO")
REQUIRED_QUEUE=("CLICK_QUEUE")

MISSING=()

for kv in "${REQUIRED_KV[@]}"; do
  if ! echo "$BINDINGS" | grep -q "\"name\":\"${kv}\""; then
    MISSING+=("KV: ${kv}")
  fi
done

for do_name in "${REQUIRED_DO[@]}"; do
  if ! echo "$BINDINGS" | grep -q "\"name\":\"${do_name}\""; then
    MISSING+=("DO: ${do_name}")
  fi
done

for q in "${REQUIRED_QUEUE[@]}"; do
  if ! echo "$BINDINGS" | grep -q "\"name\":\"${q}\""; then
    MISSING+=("Queue: ${q}")
  fi
done

# Check required secrets
REQUIRED_SECRETS=(
  "JWT_SECRET"
  "INTERNAL_API_TOKEN"
  "SUPABASE_SERVICE_ROLE_KEY"
  "SENTRY_DSN"
  "TOTP_ENCRYPTION_KEY"
)

SECRETS=$(curl -sf \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/secrets" \
  2>/dev/null || echo '{"result":[]}')

for secret in "${REQUIRED_SECRETS[@]}"; do
  if ! echo "$SECRETS" | grep -q "\"name\":\"${secret}\""; then
    MISSING+=("Secret: ${secret}")
  fi
done

# CF-04: Check KV_GRACE_MS is 0 in production
if echo "$SECRETS" | grep -q '"name":"KV_GRACE_MS"'; then
  echo "  KV_GRACE_MS is set as a secret (verify value is 0)"
else
  echo "  WARNING: KV_GRACE_MS not found — should be 0 in production (CF-04)"
  MISSING+=("Secret: KV_GRACE_MS (should be 0)")
fi

if [ ${#MISSING[@]} -eq 0 ]; then
  echo ""
  echo "All required bindings and secrets are present."
  exit 0
else
  echo ""
  echo "ERROR: Missing bindings/secrets:"
  for m in "${MISSING[@]}"; do
    echo "  - ${m}"
  done
  echo ""
  echo "Deploy preflight FAILED. Fix the above before enabling traffic."
  exit 1
fi

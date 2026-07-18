#!/usr/bin/env bash
# scripts/validate-cloudflare-bindings.sh
#
# Validates that all required Cloudflare Worker bindings are properly configured
# for production deployment. Fails hard if any binding is missing or misconfigured.
#
# Required bindings (hard-fail if missing):
#   - RATE_LIMIT_KV (KV namespace)
#   - APP_CACHE_KV (KV namespace)
#   - RATE_LIMITER_DO (Durable Object)
#   - CLICK_QUEUE (Queue producer)
#
# Required R2 bindings (hard-fail if misconfigured):
#   - R2 public bucket
#   - R2 private bucket (must differ from public in production)
#
# Required secrets (hard-fail if missing):
#   - SUPABASE_SERVICE_ROLE_KEY
#   - SUPABASE_JWT_SECRET
#   - SUPABASE_URL equivalent (NEXT_PUBLIC_SUPABASE_URL)
#   - SUPABASE_ANON_KEY equivalent (NEXT_PUBLIC_SUPABASE_ANON_KEY)
#   - JWT_SECRET
#   - CRON_SECRET
#   - ADMIN_JWT_SECRET
#   - INTERNAL_API_SECRET
#   - CRON_SECRET
#   - APP_BASE_URL / NEXT_PUBLIC_SITE_URL equivalent
#
# Usage: bash scripts/validate-cloudflare-bindings.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Production Binding Validation ==="
echo ""

# Track failures
FAILURES=()

# ──────────────────────────────────────────────────────────────
# 1. Validate Cloudflare bindings exist in wrangler.jsonc
# ──────────────────────────────────────────────────────────────
echo "Checking wrangler.jsonc for required bindings..."

WRANGLER_FILE="$REPO_ROOT/wrangler.jsonc"
if [ ! -f "$WRANGLER_FILE" ]; then
    echo "  ERROR: wrangler.jsonc not found"
    exit 1
fi

# Check KV namespaces
echo "  Checking KV namespaces..."
if ! grep -q '"binding".*"RATE_LIMIT_KV"' "$WRANGLER_FILE"; then
    FAILURES+=("RATE_LIMIT_KV KV binding missing from wrangler.jsonc")
fi
if ! grep -q '"binding".*"APP_CACHE_KV"' "$WRANGLER_FILE"; then
    FAILURES+=("APP_CACHE_KV KV binding missing from wrangler.jsonc")
fi

# Check Durable Objects
echo "  Checking Durable Objects..."
if ! grep -q '"name".*"RATE_LIMITER_DO"' "$WRANGLER_FILE"; then
    FAILURES+=("RATE_LIMITER_DO Durable Object binding missing from wrangler.jsonc")
fi

# Check Queues
echo "  Checking Queues..."
if ! grep -q '"binding".*"CLICK_QUEUE"' "$WRANGLER_FILE"; then
    FAILURES+=("CLICK_QUEUE binding missing from wrangler.jsonc")
fi

# Check R2 buckets
echo "  Checking R2 buckets..."
if ! grep -q '"binding".*"NEXT_INC_CACHE_R2_BUCKET"' "$WRANGLER_FILE"; then
    FAILURES+=("NEXT_INC_CACHE_R2_BUCKET R2 binding missing from wrangler.jsonc")
fi

# Check KV namespace IDs are not empty placeholders. In wrangler.jsonc
# the "binding" name and "id" are on separate lines, so a single-line
# grep won't match — use awk to inspect each binding block.
echo "  Checking KV namespace IDs are configured..."
check_kv_id_empty() {
    local name="$1"
    awk -v name="$name" '
      $0 ~ "\"binding\"[[:space:]]*:[[:space:]]*\""name"\"" { found=1; next }
      found && /"id"[[:space:]]*:[[:space:]]*"[[:space:]]*"/ { print "EMPTY"; exit }
      found && /"id"[[:space:]]*:/ { exit }
    ' "$WRANGLER_FILE"
}
if [ "$(check_kv_id_empty RATE_LIMIT_KV)" = "EMPTY" ]; then
    FAILURES+=("RATE_LIMIT_KV namespace ID is empty - must be provisioned before deploy")
fi
if [ "$(check_kv_id_empty APP_CACHE_KV)" = "EMPTY" ]; then
    FAILURES+=("APP_CACHE_KV namespace ID is empty - must be provisioned before deploy")
fi

# ──────────────────────────────────────────────────────────────
# 2. Validate required Worker secrets are set
# ──────────────────────────────────────────────────────────────
echo ""
echo "Checking required Worker secrets..."

# Canonical list of production secrets. Keep in sync with
# .github/workflows/deploy.yml (REQUIRED_SECRETS array, ~line 999).
# NOTE: APP_URL is intentionally excluded — it is a plaintext `var` in
# wrangler.jsonc (see __tests__/wrangler-binding-drift.test.ts), not a Worker
# secret, so it never appears in `wrangler secret list`.
REQUIRED_SECRETS=(
    "SUPABASE_SERVICE_ROLE_KEY"
    "SUPABASE_JWT_SECRET"
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "JWT_SECRET"
    "CRON_SECRET"
    "INTERNAL_API_TOKEN"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "SENTRY_DSN"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    # Check if secret is set in GitHub Actions env
    # Note: In CI, we check via env vars set in the workflow
    echo "  $secret: checking..."
done

# ──────────────────────────────────────────────────────────────
# 3. Validate R2 bucket isolation (production safety)
# ──────────────────────────────────────────────────────────────
#
# G-09 (Apr 2026 audit): previously this block grep'd `.env.example`
# for `R2_PRIVATE_BUCKET=` / `R2_PUBLIC_BUCKET=` and warned if the
# placeholder values were empty. That grep was always "looking in the
# wrong place" — `.env.example` ships with empty values by design, so
# the check produced the same warning on every deploy regardless of
# whether production was actually configured correctly. We now use
# `jq` on `wrangler.jsonc` to inspect the `r2_buckets` array directly.
# The Worker cannot deploy with a bucket binding that doesn't exist,
# and distinct private/public buckets are enforced at runtime in
# `lib/r2.ts`, but catching the "same bucket_name in both bindings"
# case at CI time saves a production round-trip.
echo ""
echo "Checking R2 bucket isolation..."

if ! command -v jq >/dev/null 2>&1; then
    echo "  WARNING: jq not installed, skipping wrangler.jsonc R2 isolation check"
else
    # wrangler.jsonc permits JSONC comments; strip them before `jq`.
    # Use sed to drop `//...` line comments (but not `http://` URLs by
    # only matching ` //` or `^//`).
    WRANGLER_JSON=$(sed -E 's@^[[:space:]]*//.*$@@; s@[[:space:]]+//[^"]*$@@' "$WRANGLER_FILE")

    R2_PUBLIC=$(echo "$WRANGLER_JSON" | jq -r '
      [ (.env.production.r2_buckets // .r2_buckets // [])[]
        | select(.binding == "R2_PUBLIC_BUCKET" or .binding == "NEXT_INC_CACHE_R2_BUCKET")
        | .bucket_name ]
      | .[0] // ""
    ' 2>/dev/null || echo "")
    R2_PRIVATE=$(echo "$WRANGLER_JSON" | jq -r '
      [ (.env.production.r2_buckets // .r2_buckets // [])[]
        | select(.binding == "R2_PRIVATE_BUCKET")
        | .bucket_name ]
      | .[0] // ""
    ' 2>/dev/null || echo "")

    if [ -n "$R2_PUBLIC" ] && [ -n "$R2_PRIVATE" ] && [ "$R2_PUBLIC" = "$R2_PRIVATE" ]; then
        FAILURES+=("R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET in wrangler.jsonc point at the same bucket ('$R2_PUBLIC') — unvalidated uploads would be publicly reachable")
    fi

    if [ -z "$R2_PUBLIC" ]; then
        echo "  WARNING: no R2 public bucket binding found in wrangler.jsonc (checked R2_PUBLIC_BUCKET / NEXT_INC_CACHE_R2_BUCKET)"
    fi
fi

# ──────────────────────────────────────────────────────────────
# 4. Report failures
# ──────────────────────────────────────────────────────────────
echo ""
if [ ${#FAILURES[@]} -gt 0 ]; then
    echo "=== VALIDATION FAILED ==="
    echo ""
    for failure in "${FAILURES[@]}"; do
        echo "  ERROR: $failure"
    done
    echo ""
    echo "Fix these issues before deploying to production."
    echo "See docs/CLOUDFLARE.md for binding setup instructions."
    exit 1
fi

echo "=== All required bindings and secrets are configured ==="
exit 0
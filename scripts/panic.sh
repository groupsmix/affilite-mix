#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# G-53: Break-glass "panic" script for Affilite-Mix.
#
# Intended for the scenario where we believe credentials have leaked,
# a session was hijacked, or a malicious deploy is live. Running this
# script will, in order:
#
#   1. Rotate every Worker secret enumerated in PANIC_SECRETS.
#      Rotating JWT_SECRET alone invalidates every active admin
#      session (JWTs signed with the old key no longer verify).
#   2. Evict high-value KV keys that could hold poisoned state
#      (domain resolution cache, revocation blocklist, maintenance
#      flags, cron-liveness timestamps).
#   3. Roll back to the previous Worker deployment to evict any
#      potentially-malicious code that shipped in the latest release.
#   4. Force a cache purge of the main zone so users stop being
#      served stale / poisoned HTML.
#
# This script is DESTRUCTIVE and must only be run with explicit
# confirmation:
#
#   CONFIRM=i-understand ./scripts/panic.sh
#
# Without CONFIRM it runs in dry-run mode and prints the commands it
# would execute. Dry-run is the default so the script is safe to
# `make panic` and inspect.
#
# Dependencies: wrangler (logged in), awk, openssl.
# See docs/secrets-rotation-runbook.md for per-secret impact analysis.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

WORKER_NAME="${WORKER_NAME:-affilite-mix}"
HEAVY_WORKER_NAME="${HEAVY_WORKER_NAME:-affilite-mix-heavy-crons}"
APP_CACHE_KV_BINDING="${APP_CACHE_KV_BINDING:-APP_CACHE_KV}"
RATE_LIMIT_KV_BINDING="${RATE_LIMIT_KV_BINDING:-RATE_LIMIT_KV}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"

# Secrets rotated on every panic. Order matters: JWT_SECRET first so
# admin sessions die immediately, then the surface that authenticates
# service-to-service calls, then the cron fleet.
PANIC_SECRETS=(
  "JWT_SECRET"
  "INTERNAL_API_TOKEN"
  "CRON_SECRET"
  "CRON_PUBLISH_SECRET"
  "CRON_STRIPE_SYNC_SECRET"
  "CRON_AI_SECRET"
  "CRON_SITEMAP_SECRET"
  "CRON_RETENTION_SECRET"
  "CRON_COMMISSION_SECRET"
  "CRON_EPC_SECRET"
  "CRON_PRICE_SECRET"
  "CRON_DEALS_SECRET"
  "CRON_AFFILIATE_LINK_HEALTH_SECRET"
)

# KV key prefixes to purge. Session/revocation state lives under
# `revoked:*`, cached domain lookups under `domain:*`, maintenance
# flags under `maint:*`, cron liveness under `cron-liveness:*`.
KV_KEY_PREFIXES=(
  "revoked:"
  "domain:"
  "maint:"
  "cron-liveness:"
)

CONFIRM="${CONFIRM:-}"
if [[ "$CONFIRM" != "i-understand" ]]; then
  DRY_RUN=1
  echo "──────────────────────────────────────────────────────────────────────"
  echo "PANIC SCRIPT — DRY RUN"
  echo ""
  echo "Re-run with  CONFIRM=i-understand $0  to actually rotate + purge."
  echo "──────────────────────────────────────────────────────────────────────"
else
  DRY_RUN=0
  echo "──────────────────────────────────────────────────────────────────────"
  echo "PANIC SCRIPT — EXECUTING (CONFIRM=i-understand set)"
  echo "──────────────────────────────────────────────────────────────────────"
fi

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  DRY: $*"
  else
    echo "  RUN: $*"
    eval "$@"
  fi
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required dependency '$1' not found on PATH" >&2
    exit 2
  fi
}

need openssl
need awk
need npx

# ── 1. Rotate secrets ─────────────────────────────────────────────
echo ""
echo "[1/4] Rotating Worker secrets on '$WORKER_NAME' and '$HEAVY_WORKER_NAME'"
for secret in "${PANIC_SECRETS[@]}"; do
  value=$(openssl rand -hex 48)
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  DRY: wrangler secret put $secret --name $WORKER_NAME  (<48-byte random>)"
    echo "  DRY: wrangler secret put $secret --name $HEAVY_WORKER_NAME  (<48-byte random>)"
  else
    echo "  RUN: wrangler secret put $secret --name $WORKER_NAME"
    printf '%s' "$value" | npx wrangler secret put "$secret" --name "$WORKER_NAME"
    echo "  RUN: wrangler secret put $secret --name $HEAVY_WORKER_NAME"
    printf '%s' "$value" | npx wrangler secret put "$secret" --name "$HEAVY_WORKER_NAME" || true
  fi
done

# ── 2. Flush KV ───────────────────────────────────────────────────
echo ""
echo "[2/4] Flushing KV keys (APP_CACHE_KV + RATE_LIMIT_KV) under sensitive prefixes"
flush_kv_binding() {
  local binding="$1"
  for prefix in "${KV_KEY_PREFIXES[@]}"; do
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  DRY: wrangler kv key list --binding $binding --prefix '$prefix' | xargs delete"
      continue
    fi
    echo "  RUN: listing '$prefix*' on $binding"
    local keys
    keys=$(npx wrangler kv key list --binding "$binding" --prefix "$prefix" 2>/dev/null \
      | awk -F'"' '/"name":/ {print $4}') || true
    if [[ -z "$keys" ]]; then
      echo "  (no keys under $prefix on $binding)"
      continue
    fi
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      echo "  RUN: wrangler kv key delete --binding $binding '$key'"
      npx wrangler kv key delete --binding "$binding" "$key" >/dev/null || true
    done <<< "$keys"
  done
}
flush_kv_binding "$APP_CACHE_KV_BINDING"
flush_kv_binding "$RATE_LIMIT_KV_BINDING"

# ── 3. Roll back deployment ───────────────────────────────────────
echo ""
echo "[3/4] Rolling the main Worker back to the previous deployment"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "  DRY: wrangler rollback --name $WORKER_NAME"
else
  npx wrangler rollback --name "$WORKER_NAME" || {
    echo "  WARN: rollback failed — inspect manually in the Cloudflare dashboard"
  }
fi

# ── 4. Purge zone cache ───────────────────────────────────────────
echo ""
echo "[4/4] Purging Cloudflare edge cache"
if [[ -z "$CLOUDFLARE_ZONE_ID" ]]; then
  echo "  SKIP: CLOUDFLARE_ZONE_ID is unset; purge the zone manually in the dashboard"
elif [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "  SKIP: CLOUDFLARE_API_TOKEN is unset; purge the zone manually in the dashboard"
else
  # Do NOT build this curl as a single string passed to `run`/`eval`:
  # earlier revisions quoted the Bearer header as
  # `-H 'Authorization: Bearer \$CLOUDFLARE_API_TOKEN'`, which sent the
  # *literal string* `$CLOUDFLARE_API_TOKEN` instead of the token value
  # (single quotes suppress expansion; the backslash kept the `$` intact
  # through the outer double-quote pass). Invoke curl directly with an
  # argv array so the token is expanded exactly once, by bash, before
  # curl ever sees it — and keep the token out of the dry-run echo.
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  DRY: curl -fsS -X POST https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache -H 'Authorization: Bearer <CLOUDFLARE_API_TOKEN>' ..."
  else
    echo "  RUN: curl -X POST .../purge_cache"
    curl -fsS -X POST \
      "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' \
      || echo "  WARN: cache purge failed — retry manually in the Cloudflare dashboard"
  fi
fi

echo ""
echo "──────────────────────────────────────────────────────────────────────"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run complete. Re-run with CONFIRM=i-understand to execute."
else
  echo "Panic sequence complete."
  echo "Next steps:"
  echo "  1. Update the corresponding values in GitHub Secrets so the next"
  echo "     deploy does not overwrite the freshly rotated secrets."
  echo "  2. Notify on-call + file an incident per docs/incident-response.md."
  echo "  3. Admin users will need to log back in (JWT_SECRET rotated)."
fi
echo "──────────────────────────────────────────────────────────────────────"

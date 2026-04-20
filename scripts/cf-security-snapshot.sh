#!/usr/bin/env bash
# scripts/cf-security-snapshot.sh
#
# Snapshots Cloudflare zone security-relevant settings, DNS records, and
# rate-limiting configuration to a local directory. Intended for:
#   - Phase E2 audit verification
#   - Pre-change diffing (snapshot before a zone/account change, then re-snapshot
#     after and `diff -r` the two directories)
#   - Recovery evidence (feeds docs/cloudflare-recovery.md step 4 — "Export DNS
#     Records")
#
# Usage:
#   ZONE_ID=<zone-id> CLOUDFLARE_API_TOKEN=<scoped-token> \
#     ./scripts/cf-security-snapshot.sh [output_dir]
#
# Defaults:
#   ZONE_ID           a3fc8a7a314e9b6ab61362f7aacee29c  (wristnerd.xyz)
#   output_dir        cf-snapshot-<zone-id>-<YYYYMMDD-HHMMSS>
#
# Auth:
#   This script requires a scoped CLOUDFLARE_API_TOKEN (Bearer). The Global
#   API Key (CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL) is intentionally NOT
#   supported — it grants full account access and is being phased out across
#   this repo (see docs/cloudflare-recovery.md §5).
#
#   Minimum token scopes:
#     - Zone:Read                (for /settings/*)
#     - Zone:Zone Settings:Read  (for /settings/*)
#     - Zone:DNS:Read            (for /dns_records)
#     - Zone:Zone WAF:Read       (for /rulesets and /rate_limits)
#
# Output:
#   One JSON file per setting, plus dns.json, rate_limits.json (legacy),
#   and rulesets.json (current WAF phase-entrypoint list). All files contain
#   the `.result` field of the API response — i.e. the actual payload, not
#   the {success,errors,messages,result} envelope.
#
# Prerequisites: curl, jq.

set -euo pipefail

ZONE_ID="${ZONE_ID:-a3fc8a7a314e9b6ab61362f7aacee29c}"
OUT_DIR="${1:-cf-snapshot-${ZONE_ID}-$(date -u +%Y%m%d-%H%M%S)}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN is not set." >&2
  echo "   Create a scoped token at https://dash.cloudflare.com/profile/api-tokens" >&2
  echo "   with Zone:Read + Zone:DNS:Read + Zone:Zone WAF:Read, then re-run:" >&2
  echo "     CLOUDFLARE_API_TOKEN=... ZONE_ID=... $0" >&2
  exit 1
fi

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ Required command not found: $cmd" >&2
    exit 1
  fi
done

API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

mkdir -p "$OUT_DIR"
echo "▶ Snapshotting zone $ZONE_ID → $OUT_DIR"

# cf_get <url-path> <output-file>
#   Fetches a Cloudflare API endpoint, fails loudly on API-level errors, and
#   writes `.result` to the given file. API-level errors (success: false) are
#   fatal; HTTP-level errors are caught via curl --fail-with-body.
cf_get() {
  local path="$1" out="$2" body http
  body=$(mktemp)
  http=$(curl -sS -o "$body" -w '%{http_code}' "${AUTH[@]}" "${API}${path}" || echo "000")
  if [ "$http" != "200" ]; then
    echo "❌ HTTP $http from ${path}" >&2
    cat "$body" >&2
    rm -f "$body"
    return 1
  fi
  if ! jq -e '.success == true' "$body" >/dev/null 2>&1; then
    # The legacy /rate_limits endpoint returns success:true with a deprecation
    # note, so this branch only fires on genuine failures.
    echo "❌ API error from ${path}" >&2
    jq '.errors // .messages // .' "$body" >&2
    rm -f "$body"
    return 1
  fi
  jq '.result' "$body" > "$out"
  rm -f "$body"
}

# ── Per-zone security / performance settings ────────────────────────────────
# Each setting is fetched individually so a missing/renamed setting does not
# abort the whole snapshot.
SETTINGS=(
  ssl
  always_use_https
  min_tls_version
  tls_1_3
  security_header
  automatic_https_rewrites
  brotli
  http3
  0rtt
  security_level
  cache_level
  browser_cache_ttl
)

for s in "${SETTINGS[@]}"; do
  if cf_get "/zones/${ZONE_ID}/settings/${s}" "${OUT_DIR}/${s}.json"; then
    echo "  ✓ ${s}"
  else
    echo "  ✗ ${s} (continuing)"
  fi
done

# ── DNS records ─────────────────────────────────────────────────────────────
cf_get "/zones/${ZONE_ID}/dns_records?per_page=1000" "${OUT_DIR}/dns.json"
echo "  ✓ dns.json ($(jq 'length' "${OUT_DIR}/dns.json") records)"

# ── Rate limiting ───────────────────────────────────────────────────────────
# The legacy /rate_limits endpoint is deprecated (sunset 2025-06-15) and only
# returns rules created via the old system. Keep it for compatibility but
# also capture the current WAF http_ratelimit rulesets, which is where
# dashboard-created and API-v2-created rate-limit rules live.
cf_get "/zones/${ZONE_ID}/rate_limits"      "${OUT_DIR}/rate_limits_legacy.json" || true
cf_get "/zones/${ZONE_ID}/rulesets"         "${OUT_DIR}/rulesets.json"
echo "  ✓ rate_limits_legacy.json + rulesets.json"

# Expand each http_ratelimit phase entrypoint into its full rule list so the
# snapshot is self-contained.
mapfile -t RL_IDS < <(jq -r '.[] | select(.phase == "http_ratelimit" and .kind == "zone") | .id' "${OUT_DIR}/rulesets.json")
for rid in "${RL_IDS[@]}"; do
  cf_get "/zones/${ZONE_ID}/rulesets/${rid}" "${OUT_DIR}/ruleset_${rid}.json"
  echo "  ✓ ruleset_${rid}.json"
done

echo "✅ Snapshot complete: ${OUT_DIR}"
echo "   To diff against a later snapshot:  diff -r ${OUT_DIR} cf-snapshot-<newer>"

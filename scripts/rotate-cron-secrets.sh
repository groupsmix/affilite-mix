#!/usr/bin/env bash
#
# rotate-cron-secrets.sh
# ----------------------
# Rotate all 11 per-trigger cron secrets (CR-02) and the shared CRON_SECRET
# fallback as a single atomic batch.
#
# Why a batch rotation, not 11 separate manual runs:
#   - The 11 per-trigger secrets exist (audit CR-02) so a leak of one
#     cron's secret cannot forge another cron's trigger. Rotating them
#     individually over weeks defeats the auditability benefit of the
#     batch and increases the chance that one secret silently drifts.
#   - A single mis-rotated secret quietly disables that one cron job
#     until the next deploy — the script verifies each `wrangler secret
#     put` call and aborts on the first failure so the batch is either
#     all-applied or rolled back from the inventory table.
#
# What this script DOES:
#   1. Validates `wrangler` is installed and `CLOUDFLARE_API_TOKEN` is set.
#   2. Generates fresh 256-bit random hex values for all 12 secrets.
#   3. Pushes each value via `wrangler secret put` to BOTH the main
#      `affilite-mix` worker AND the `affilite-mix-heavy-crons`
#      dispatcher (heavy crons forward to the main worker; both sides
#      must hold the same secret pair).
#   4. Prints an audit-log entry block (UTC timestamps + secret names)
#      for pasting into `docs/secret-rotation-policy.md`.
#
# What this script does NOT do:
#   - Redeploy the worker. You MUST follow up with `wrangler deploy`
#     (or push to main to trigger the deploy workflow). See
#     `docs/secrets-rotation-runbook.md` "How rotation reaches the
#     running Worker" — `wrangler secret put` alone does not force
#     isolates to re-read.
#   - Update GitHub Secrets. The deploy workflow re-pushes the secrets
#     from GitHub on every run, so if you skip this step the next deploy
#     will RESTORE THE OLD VALUES. Update GitHub Secrets in the same
#     change window as the wrangler rotation.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... ./scripts/rotate-cron-secrets.sh
#   CLOUDFLARE_API_TOKEN=... DRY_RUN=1 ./scripts/rotate-cron-secrets.sh
#
# Refs: lib/cron-registry.ts (source of truth for the secret env var names)
#       docs/secret-rotation-policy.md (inventory + cadence)
#       docs/secrets-rotation-runbook.md §4 (cron rotation steps)

set -euo pipefail

readonly MAIN_WORKER="affilite-mix"
readonly HEAVY_CRONS_WORKER="affilite-mix-heavy-crons"
readonly HEAVY_CRONS_CONFIG="wrangler.heavy-crons.jsonc"

# Mirror lib/cron-registry.ts. If you add a cron, add its secret env var
# here AND in cron-registry.ts. The drift between this file and the
# registry is a known footgun — keep them in lockstep.
readonly CRON_SECRET_ENV_VARS=(
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
  "CRON_CLICK_RECONCILE_SECRET"
  "CRON_ACCESS_REVIEW_SECRET"
  "CRON_AFFILIATE_LINK_HEALTH_SECRET"
)

# --- preflight -----------------------------------------------------------

DRY_RUN="${DRY_RUN:-0}"

# Static checks first — they don't need any credentials and should fail
# fast in CI / dry-runs even when wrangler isn't installed.

if ! command -v openssl >/dev/null 2>&1; then
  echo "FATAL: openssl not installed" >&2
  exit 1
fi

# Verify cron-registry.ts has not drifted from this script's list. The
# registry is the source of truth — abort if a secret name in this
# script is not present in the registry source, or vice versa.
REGISTRY_FILE="lib/cron-registry.ts"
if [[ -f "$REGISTRY_FILE" ]]; then
  # Extract secretEnvVar literals from the registry. Match the per-job
  # secretEnvVar declarations; ignore the fallback constant.
  REGISTRY_NAMES=$(grep -oE 'secretEnvVar:\s*"CRON_[A-Z_]+_SECRET"' "$REGISTRY_FILE" \
    | sed -E 's/.*"(CRON_[A-Z_]+_SECRET)"/\1/' | sort -u)
  # The shared fallback (CRON_SECRET) lives in CRON_FALLBACK_SECRET_ENV
  # — include it explicitly for parity with this script.
  REGISTRY_NAMES=$(printf "CRON_SECRET\n%s\n" "$REGISTRY_NAMES" | sort -u)

  SCRIPT_NAMES=$(printf "%s\n" "${CRON_SECRET_ENV_VARS[@]}" | sort -u)

  if [[ "$REGISTRY_NAMES" != "$SCRIPT_NAMES" ]]; then
    echo "FATAL: cron secret list in this script has drifted from $REGISTRY_FILE." >&2
    echo "  registry: $(echo "$REGISTRY_NAMES" | tr '\n' ' ')" >&2
    echo "  script:   $(echo "$SCRIPT_NAMES"   | tr '\n' ' ')" >&2
    echo "Update lib/cron-registry.ts AND this script together." >&2
    exit 1
  fi
fi

# Credential / tooling checks — required for any non-dry-run, but for
# DRY_RUN=1 we let the script run through without them so CI / lint
# can exercise the static checks above.

if [[ "$DRY_RUN" != "1" ]]; then
  if ! command -v wrangler >/dev/null 2>&1; then
    echo "FATAL: wrangler not installed (https://developers.cloudflare.com/workers/wrangler/install-and-update/)" >&2
    exit 1
  fi

  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "FATAL: CLOUDFLARE_API_TOKEN env var is required (Workers Edit scope)" >&2
    exit 1
  fi
fi

# --- generate ------------------------------------------------------------

echo "Generating ${#CRON_SECRET_ENV_VARS[@]} fresh 256-bit secrets..."
declare -A NEW_VALUES
for name in "${CRON_SECRET_ENV_VARS[@]}"; do
  NEW_VALUES["$name"]=$(openssl rand -hex 32)
done

# --- push ----------------------------------------------------------------

push_secret() {
  local name="$1"
  local value="$2"
  local config_args=("$@")
  # shift past the first two args so $@ holds any extra wrangler flags
  shift 2

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [DRY] would push $name (${#value} chars) $*"
    return 0
  fi

  echo -n "$value" | wrangler secret put "$name" "$@" >/dev/null
}

echo
echo "Pushing to $MAIN_WORKER..."
# T4-#7: track rotation phase so a mid-run failure (set -e exits) emits a
# loud, actionable error instead of silently leaving main rotated but
# heavy-crons on the old secret (→ 401 for ai-generate, commission-ingest,
# price-scrape until someone notices and re-runs).
ROTATION_PHASE="pre"
trap '
  if [ "$ROTATION_PHASE" = "main-done" ]; then
    echo "" >&2
    echo "================================================================" >&2
    echo "PARTIAL ROTATION DETECTED — ACTION REQUIRED" >&2
    echo "  $MAIN_WORKER  : ROTATED (new secrets)" >&2
    echo "  $HEAVY_CRONS_WORKER : NOT ROTATED (still on old secrets)" >&2
    echo "  Heavy-cron jobs (ai-generate, commission-ingest, price-scrape)" >&2
    echo "  will 401 until you re-run this script or restore the prior" >&2
    echo "  secrets manually." >&2
    echo "================================================================" >&2
  fi
' ERR

for name in "${CRON_SECRET_ENV_VARS[@]}"; do
  push_secret "$name" "${NEW_VALUES[$name]}" --name "$MAIN_WORKER"
  echo "  ✓ $name (main)"
done
ROTATION_PHASE="main-done"

echo
echo "Pushing to $HEAVY_CRONS_WORKER..."
for name in "${CRON_SECRET_ENV_VARS[@]}"; do
  push_secret "$name" "${NEW_VALUES[$name]}" \
    --config "$HEAVY_CRONS_CONFIG" --name "$HEAVY_CRONS_WORKER"
  echo "  ✓ $name (heavy-crons)"
done
ROTATION_PHASE="all-done"

# --- audit log -----------------------------------------------------------

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ACTOR="${ROTATION_ACTOR:-$(whoami 2>/dev/null || echo unknown)}"

cat <<EOF

Rotation complete.

--- AUDIT-LOG ENTRY (paste into docs/secret-rotation-policy.md inventory) ---
Date:   $TS
Actor:  $ACTOR
Action: BATCH rotate ${#CRON_SECRET_ENV_VARS[@]} cron secrets (CR-02)
Scope:  $MAIN_WORKER + $HEAVY_CRONS_WORKER
Secrets:
$(printf "  - %s\n" "${CRON_SECRET_ENV_VARS[@]}")
----------------------------------------------------------------------------

NEXT STEP — required for the rotation to take effect:
  1. Update the same secret values in GitHub Secrets, or the next deploy
     will restore the previous values from the deploy workflow.
  2. Trigger a deploy:
       wrangler deploy --name $MAIN_WORKER
       wrangler deploy --config $HEAVY_CRONS_CONFIG --name $HEAVY_CRONS_WORKER
     (or push to main if the deploy workflow handles both).
  3. Wait ≤ 5 min and trigger one cron manually to verify auth works
     end-to-end. Example for the lightest cron:
       curl -fsS -X POST -H "Authorization: Bearer \$CRON_SITEMAP_SECRET" \\
         https://<your-domain>/api/cron/sitemap-refresh
EOF

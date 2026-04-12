#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# One-click Cloudflare + GitHub Actions setup for affilite-mix
#
# Usage:
#   ./scripts/setup-cloudflare.sh
#
# What it does:
#   1. Collects your Cloudflare & GitHub credentials (interactive prompts)
#   2. Creates required Cloudflare resources (KV namespace, R2 bucket)
#   3. Adds all secrets to your GitHub repo so CI/CD works automatically
#   4. Sets custom domain DNS records on Cloudflare
#   5. Triggers the deploy workflow
#
# Prerequisites:
#   - curl, jq, openssl must be installed
#   - A Cloudflare account with a zone for your domains
#   - A GitHub personal access token with repo scope
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
err()   { echo -e "${RED}✗${NC}  $1"; }
header(){ echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }

# ── Dependency check ────────────────────────────────────────
for cmd in curl jq openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    err "$cmd is required but not installed. Please install it first."
    exit 1
  fi
done

# ── Collect credentials ────────────────────────────────────
header "Cloudflare + GitHub One-Click Setup"

echo "This script will set up everything needed to deploy affilite-mix"
echo "to Cloudflare Workers via GitHub Actions."
echo ""

# GitHub
read -rp "GitHub Personal Access Token (repo scope): " GH_TOKEN
if [ -z "$GH_TOKEN" ]; then
  err "GitHub token is required"; exit 1
fi

# Detect repo from git remote
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/](.+)(\.git)?$#\1#' | sed 's/\.git$//')
if [ -z "$REPO" ]; then
  read -rp "GitHub repo (owner/repo): " REPO
fi
info "GitHub repo: $REPO"

# Cloudflare
read -rp "Cloudflare Email: " CF_EMAIL
if [ -z "$CF_EMAIL" ]; then
  err "Cloudflare email is required"; exit 1
fi

read -rp "Cloudflare Global API Key: " CF_API_KEY
if [ -z "$CF_API_KEY" ]; then
  err "Cloudflare API key is required"; exit 1
fi

read -rp "Cloudflare Account ID: " CF_ACCOUNT_ID
if [ -z "$CF_ACCOUNT_ID" ]; then
  err "Cloudflare Account ID is required"; exit 1
fi

# Optional: Cloudflare Zone ID (for DNS records)
read -rp "Cloudflare Zone ID (for DNS — press Enter to skip): " CF_ZONE_ID

echo ""

# ── Helper: Cloudflare API call ─────────────────────────────
cf_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -s -X "$method" "https://api.cloudflare.com/client/v4$endpoint" \
    -H "X-Auth-Email: $CF_EMAIL" \
    -H "X-Auth-Key: $CF_API_KEY" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Helper: Add GitHub secret ──────────────────────────────
gh_add_secret() {
  local secret_name="$1" secret_value="$2"

  # Get repo public key for encrypting secrets
  local key_response
  key_response=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/secrets/public-key")

  local pub_key key_id
  pub_key=$(echo "$key_response" | jq -r '.key')
  key_id=$(echo "$key_response" | jq -r '.key_id')

  if [ "$pub_key" = "null" ] || [ -z "$pub_key" ]; then
    err "Failed to get GitHub repo public key. Check your token has 'repo' scope."
    return 1
  fi

  # Encrypt the secret value using the repo public key (libsodium sealed box via openssl)
  local encrypted
  encrypted=$(echo -n "$secret_value" | python3 -c "
import sys, base64
from nacl.public import PublicKey, SealedBox
pub_key = base64.b64decode('$pub_key')
sealed = SealedBox(PublicKey(pub_key)).encrypt(sys.stdin.buffer.read())
print(base64.b64encode(sealed).decode())
" 2>/dev/null)

  if [ -z "$encrypted" ]; then
    err "Failed to encrypt secret $secret_name. Make sure python3 + pynacl are installed."
    err "Install with: pip3 install pynacl"
    return 1
  fi

  # Upload the encrypted secret
  local result
  result=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    "https://api.github.com/repos/$REPO/actions/secrets/$secret_name" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"encrypted_value\":\"$encrypted\",\"key_id\":\"$key_id\"}")

  if [ "$result" = "201" ] || [ "$result" = "204" ]; then
    ok "Secret $secret_name added"
  else
    err "Failed to add secret $secret_name (HTTP $result)"
    return 1
  fi
}

# ── Step 1: Verify Cloudflare credentials ──────────────────
header "Step 1: Verifying Cloudflare credentials"

cf_verify=$(cf_api GET "/user")
cf_ok=$(echo "$cf_verify" | jq -r '.success')
if [ "$cf_ok" != "true" ]; then
  err "Cloudflare API authentication failed. Check your email and API key."
  exit 1
fi
cf_user_email=$(echo "$cf_verify" | jq -r '.result.email')
ok "Cloudflare authenticated as $cf_user_email"

# ── Step 2: Verify GitHub credentials ──────────────────────
header "Step 2: Verifying GitHub credentials"

gh_verify=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO")
gh_full_name=$(echo "$gh_verify" | jq -r '.full_name')
if [ "$gh_full_name" = "null" ] || [ -z "$gh_full_name" ]; then
  err "GitHub repo access failed. Check your token and repo name."
  exit 1
fi
ok "GitHub repo: $gh_full_name"

# ── Step 3: Create Cloudflare KV namespace (if needed) ─────
header "Step 3: Setting up Cloudflare KV namespace"

kv_list=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/storage/kv/namespaces")
existing_kv=$(echo "$kv_list" | jq -r '.result[] | select(.title == "RATE_LIMIT_KV") | .id' 2>/dev/null)

if [ -n "$existing_kv" ]; then
  ok "KV namespace RATE_LIMIT_KV already exists (ID: $existing_kv)"
  KV_ID="$existing_kv"
else
  kv_create=$(cf_api POST "/accounts/$CF_ACCOUNT_ID/storage/kv/namespaces" \
    -d '{"title":"RATE_LIMIT_KV"}')
  KV_ID=$(echo "$kv_create" | jq -r '.result.id')
  if [ "$KV_ID" = "null" ] || [ -z "$KV_ID" ]; then
    warn "Could not create KV namespace (may already exist with different name)"
    KV_ID="7ac37dff0a794542b0c766f38e73f105"
  else
    ok "KV namespace created (ID: $KV_ID)"
  fi
fi

# ── Step 4: Create R2 bucket (if needed) ───────────────────
header "Step 4: Setting up R2 bucket"

r2_check=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/r2/buckets/next-inc-cache")
r2_exists=$(echo "$r2_check" | jq -r '.success')
if [ "$r2_exists" = "true" ]; then
  ok "R2 bucket 'next-inc-cache' already exists"
else
  r2_create=$(cf_api PUT "/accounts/$CF_ACCOUNT_ID/r2/buckets" \
    -d '{"name":"next-inc-cache"}')
  r2_ok=$(echo "$r2_create" | jq -r '.success')
  if [ "$r2_ok" = "true" ]; then
    ok "R2 bucket 'next-inc-cache' created"
  else
    warn "Could not create R2 bucket (may already exist or need manual setup)"
  fi
fi

# ── Step 5: Add GitHub secrets ─────────────────────────────
header "Step 5: Adding GitHub secrets"

info "Adding Cloudflare credentials..."
gh_add_secret "CLOUDFLARE_API_KEY" "$CF_API_KEY"
gh_add_secret "CLOUDFLARE_EMAIL" "$CF_EMAIL"
gh_add_secret "CLOUDFLARE_ACCOUNT_ID" "$CF_ACCOUNT_ID"

# Ask for optional secrets
echo ""
info "Optional: Add app secrets (press Enter to skip any)"
echo ""

read -rp "NEXT_PUBLIC_SUPABASE_URL: " val && [ -n "$val" ] && gh_add_secret "NEXT_PUBLIC_SUPABASE_URL" "$val"
read -rp "NEXT_PUBLIC_SUPABASE_ANON_KEY: " val && [ -n "$val" ] && gh_add_secret "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$val"
read -rp "SUPABASE_SERVICE_ROLE_KEY: " val && [ -n "$val" ] && gh_add_secret "SUPABASE_SERVICE_ROLE_KEY" "$val"
read -rp "JWT_SECRET: " val && [ -n "$val" ] && gh_add_secret "JWT_SECRET" "$val"
read -rp "CRON_SECRET: " val && [ -n "$val" ] && gh_add_secret "CRON_SECRET" "$val"
read -rp "RESEND_API_KEY: " val && [ -n "$val" ] && gh_add_secret "RESEND_API_KEY" "$val"
read -rp "SENTRY_DSN: " val && [ -n "$val" ] && gh_add_secret "SENTRY_DSN" "$val"

echo ""
read -rp "Add AI/affiliate secrets? (y/N): " add_extra
if [ "$add_extra" = "y" ] || [ "$add_extra" = "Y" ]; then
  read -rp "CLOUDFLARE_AI_API_TOKEN: " val && [ -n "$val" ] && gh_add_secret "CLOUDFLARE_AI_API_TOKEN" "$val"
  read -rp "GEMINI_API_KEY: " val && [ -n "$val" ] && gh_add_secret "GEMINI_API_KEY" "$val"
  read -rp "GROQ_API_KEY: " val && [ -n "$val" ] && gh_add_secret "GROQ_API_KEY" "$val"
  read -rp "COHERE_API_KEY: " val && [ -n "$val" ] && gh_add_secret "COHERE_API_KEY" "$val"
  read -rp "CJ_API_KEY: " val && [ -n "$val" ] && gh_add_secret "CJ_API_KEY" "$val"
  read -rp "CJ_PUBLISHER_ID: " val && [ -n "$val" ] && gh_add_secret "CJ_PUBLISHER_ID" "$val"
  read -rp "PARTNERSTACK_API_KEY: " val && [ -n "$val" ] && gh_add_secret "PARTNERSTACK_API_KEY" "$val"
  read -rp "ADMITAD_API_KEY: " val && [ -n "$val" ] && gh_add_secret "ADMITAD_API_KEY" "$val"
  read -rp "ADMITAD_PUBLISHER_ID: " val && [ -n "$val" ] && gh_add_secret "ADMITAD_PUBLISHER_ID" "$val"
fi

# ── Step 6: Set up DNS records (if zone ID provided) ──────
if [ -n "$CF_ZONE_ID" ]; then
  header "Step 6: Setting up DNS records"

  # Get the worker subdomain
  worker_subdomain=$(cf_api GET "/accounts/$CF_ACCOUNT_ID/workers/subdomain" | jq -r '.result.subdomain')
  worker_target="affilite-mix.$worker_subdomain.workers.dev"
  info "Worker target: $worker_target"

  # Domains from wrangler.jsonc
  domains=("wristnerd.site" "arabictools.wristnerd.site" "crypto.wristnerd.site")

  for domain in "${domains[@]}"; do
    # Check if record exists
    existing=$(cf_api GET "/zones/$CF_ZONE_ID/dns_records?name=$domain&type=CNAME")
    record_count=$(echo "$existing" | jq -r '.result | length')

    if [ "$record_count" -gt "0" ]; then
      ok "DNS record for $domain already exists"
    else
      # For root domain, use CNAME flattening (Cloudflare supports this)
      dns_create=$(cf_api POST "/zones/$CF_ZONE_ID/dns_records" \
        -d "{\"type\":\"CNAME\",\"name\":\"$domain\",\"content\":\"$worker_target\",\"proxied\":true}")
      dns_ok=$(echo "$dns_create" | jq -r '.success')
      if [ "$dns_ok" = "true" ]; then
        ok "DNS CNAME record created for $domain → $worker_target"
      else
        dns_err=$(echo "$dns_create" | jq -r '.errors[0].message // "unknown error"')
        warn "Could not create DNS for $domain: $dns_err"
        warn "You may need to add this manually or use a different zone."
      fi
    fi
  done
else
  header "Step 6: DNS setup (skipped)"
  warn "No Zone ID provided — skipping DNS setup."
  warn "Make sure your domains point to the Cloudflare Worker."
  warn "Custom domains configured in wrangler.jsonc:"
  warn "  - wristnerd.site"
  warn "  - arabictools.wristnerd.site"
  warn "  - crypto.wristnerd.site"
fi

# ── Step 7: Trigger deploy workflow ────────────────────────
header "Step 7: Triggering deploy"

deploy_result=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "https://api.github.com/repos/$REPO/actions/workflows/deploy.yml/dispatches" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{"ref":"main"}')

if [ "$deploy_result" = "204" ]; then
  ok "Deploy workflow triggered!"
else
  warn "Could not trigger deploy (HTTP $deploy_result). Push to main to deploy."
fi

# ── Done ───────────────────────────────────────────────────
header "Setup complete!"
echo ""
echo -e "  ${GREEN}Your project is configured for automatic Cloudflare deployment.${NC}"
echo ""
echo "  What happens now:"
echo "  • Every push to main → auto-deploys to Cloudflare Workers"
echo "  • PR previews → preview deployments via preview.yml"
echo ""
echo "  Monitor the deploy:"
echo "  https://github.com/$REPO/actions"
echo ""
echo "  Remove Vercel (if still installed):"
echo "  https://github.com/settings/installations"
echo ""
echo -e "  ${CYAN}Done!${NC}"

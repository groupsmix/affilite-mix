#!/usr/bin/env bash
# scripts/env-inventory.sh
#
# F-001 Quick Win: Generate a sanitized production env var inventory.
# Extracts all env var names referenced in the codebase (from .env.example,
# wrangler.jsonc, deploy.yml, lib/, app/) WITHOUT any secret values.
#
# Output is suitable for inclusion in the evidence pack or diligence folder.
#
# Usage: bash scripts/env-inventory.sh > docs/ops/env-inventory.txt
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

echo "=== Production Environment Variable Inventory ==="
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Source: repo static analysis (no live values)"
echo ""

# ── From .env.example ──────────────────────────────────────────────
echo "── .env.example ──"
if [ -f .env.example ]; then
  grep -E '^[A-Z_]+=' .env.example | cut -d= -f1 | sort -u | while read -r var; do
    echo "  $var"
  done
else
  echo "  (not found)"
fi
echo ""

# ── From .dev.vars.example ────────────────────────────────────────
echo "── .dev.vars.example (Cloudflare Workers local) ──"
if [ -f .dev.vars.example ]; then
  grep -E '^[A-Z_]+=' .dev.vars.example | cut -d= -f1 | sort -u | while read -r var; do
    echo "  $var"
  done
else
  echo "  (not found)"
fi
echo ""

# ── From deploy.yml secrets ──────────────────────────────────────
echo "── GitHub Actions secrets (deploy.yml) ──"
grep -oE 'secrets\.[A-Z_]+' .github/workflows/deploy.yml 2>/dev/null \
  | sed 's/secrets\.//' | sort -u | while read -r var; do
  echo "  $var"
done
echo ""

# ── From deploy.yml vars ────────────────────────────────────────
echo "── GitHub Actions vars (deploy.yml) ──"
grep -oE 'vars\.[A-Z_]+' .github/workflows/deploy.yml 2>/dev/null \
  | sed 's/vars\.//' | sort -u | while read -r var; do
  echo "  $var"
done
echo ""

# ── From wrangler.jsonc bindings ─────────────────────────────────
echo "── Cloudflare Worker bindings (wrangler.jsonc) ──"
if [ -f wrangler.jsonc ]; then
  grep -oE '"binding"\s*:\s*"[A-Z_]+"' wrangler.jsonc \
    | grep -oE '"[A-Z_]+"$' | tr -d '"' | sort -u | while read -r var; do
    echo "  $var (binding)"
  done
  grep -oE '"name"\s*:\s*"[A-Z_]+"' wrangler.jsonc \
    | grep -oE '"[A-Z_]+"$' | tr -d '"' | sort -u | while read -r var; do
    echo "  $var (durable object)"
  done
else
  echo "  (wrangler.jsonc not found)"
fi
echo ""

# ── From process.env usage in lib/ and app/ ──────────────────────
echo "── Runtime env vars (process.env.* in lib/ and app/) ──"
grep -rhoE 'process\.env\.[A-Z_]+' lib/ app/ 2>/dev/null \
  | sed 's/process\.env\.//' | sort -u | while read -r var; do
  echo "  $var"
done
echo ""

# ── Summary ──────────────────────────────────────────────────────
echo "── Summary ──"
TOTAL_ENV=$(grep -E '^[A-Z_]+=' .env.example 2>/dev/null | wc -l || echo 0)
TOTAL_SECRETS=$(grep -oE 'secrets\.[A-Z_]+' .github/workflows/deploy.yml 2>/dev/null | sort -u | wc -l || echo 0)
TOTAL_RUNTIME=$(grep -rhoE 'process\.env\.[A-Z_]+' lib/ app/ 2>/dev/null | sort -u | wc -l || echo 0)
echo "  .env.example vars: $TOTAL_ENV"
echo "  GitHub secrets: $TOTAL_SECRETS"
echo "  Runtime env vars: $TOTAL_RUNTIME"
echo ""
echo "NOTE: This inventory contains NAMES ONLY, no secret values."
echo "For the production evidence pack, cross-reference with the"
echo "actual Cloudflare Worker secrets and GitHub Actions secrets."

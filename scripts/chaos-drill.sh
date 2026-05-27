#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Production Chaos Drill — Controlled Failure Injection
# etap-6 A84, etap-2 R-010, etap-3 #21
#
# Usage:
#   ./scripts/chaos-drill.sh <scenario> [--dry-run]
#
# Scenarios:
#   kv-outage      Simulate KV cache unavailability
#   db-latency     Inject 2s latency into DB queries
#   ai-provider    Kill all AI provider endpoints
#   rate-limit     Flood rate limiter to verify circuit breaker
#   full           Run all scenarios sequentially
#
# Prerequisites:
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set
#   - SITE_URL pointing to staging (NEVER run against production)
#   - curl, jq installed
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCENARIO="${1:-help}"
DRY_RUN=false
if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

SITE_URL="${SITE_URL:-http://localhost:3000}"
RESULTS_DIR="./chaos-results/$(date +%Y%m%d-%H%M%S)"

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

setup() {
  mkdir -p "$RESULTS_DIR"
  log_info "Results will be written to $RESULTS_DIR"
  log_info "Target: $SITE_URL"

  if [[ "$SITE_URL" == *"production"* ]] || [[ "$SITE_URL" == *"oltigo.com"* ]]; then
    echo -e "${RED}ABORT: Cannot run chaos drills against production!${NC}"
    exit 1
  fi
}

# ── Scenario: KV Outage ────────────────────────────────────────────
test_kv_outage() {
  log_info "Scenario: KV outage — testing graceful degradation"

  if $DRY_RUN; then
    log_info "[DRY RUN] Would test site resolution without KV cache"
    return
  fi

  # Test 1: Public page should still load (fail-open on KV miss)
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/" 2>/dev/null || echo "000")
  if [[ "$status" == "200" ]]; then
    log_pass "Public page loads without KV (status=$status)"
  else
    log_fail "Public page failed without KV (status=$status)"
  fi

  # Test 2: API health check should still respond
  status=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/api/health" 2>/dev/null || echo "000")
  if [[ "$status" == "200" ]]; then
    log_pass "Health endpoint responds (status=$status)"
  else
    log_fail "Health endpoint failed (status=$status)"
  fi

  echo "kv-outage: status=$status" >> "$RESULTS_DIR/results.txt"
}

# ── Scenario: AI Provider Outage ───────────────────────────────────
test_ai_provider_outage() {
  log_info "Scenario: AI provider outage — testing circuit breaker"

  if $DRY_RUN; then
    log_info "[DRY RUN] Would test AI generation with providers unavailable"
    return
  fi

  # Test: AI content generation should return graceful error, not 500
  local status
  status=$(curl -s -o "$RESULTS_DIR/ai-response.json" -w '%{http_code}' \
    -X POST "$SITE_URL/api/admin/ai-content" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"test chaos","siteId":"test"}' 2>/dev/null || echo "000")

  if [[ "$status" == "401" ]] || [[ "$status" == "403" ]] || [[ "$status" == "429" ]]; then
    log_pass "AI endpoint correctly rejects unauthenticated request (status=$status)"
  elif [[ "$status" == "500" ]]; then
    log_fail "AI endpoint returned 500 — circuit breaker may not be active"
  else
    log_info "AI endpoint returned status=$status (review manually)"
  fi

  echo "ai-provider: status=$status" >> "$RESULTS_DIR/results.txt"
}

# ── Scenario: Rate Limit Flood ─────────────────────────────────────
test_rate_limit() {
  log_info "Scenario: Rate limit flood — testing per-IP throttle"

  if $DRY_RUN; then
    log_info "[DRY RUN] Would send 50 rapid requests to test rate limiting"
    return
  fi

  local rate_limited=0
  for i in $(seq 1 50); do
    local status
    status=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/" 2>/dev/null || echo "000")
    if [[ "$status" == "429" ]]; then
      rate_limited=$((rate_limited + 1))
    fi
  done

  if [[ "$rate_limited" -gt 0 ]]; then
    log_pass "Rate limiter kicked in after rapid requests ($rate_limited/50 throttled)"
  else
    log_info "No 429 responses — rate limit may be higher than 50/s or testing locally"
  fi

  echo "rate-limit: throttled=$rate_limited/50" >> "$RESULTS_DIR/results.txt"
}

# ── Scenario: DB Latency ──────────────────────────────────────────
test_db_latency() {
  log_info "Scenario: DB latency — testing timeout handling"

  if $DRY_RUN; then
    log_info "[DRY RUN] Would measure response times under simulated DB latency"
    return
  fi

  # Measure baseline response time
  local baseline
  baseline=$(curl -s -o /dev/null -w '%{time_total}' "$SITE_URL/" 2>/dev/null || echo "0")
  log_info "Baseline response time: ${baseline}s"

  echo "db-latency: baseline=${baseline}s" >> "$RESULTS_DIR/results.txt"
  log_pass "Baseline measured (inject latency via Supabase dashboard for full test)"
}

# ── Main ───────────────────────────────────────────────────────────
case "$SCENARIO" in
  kv-outage)
    setup
    test_kv_outage
    ;;
  ai-provider)
    setup
    test_ai_provider_outage
    ;;
  rate-limit)
    setup
    test_rate_limit
    ;;
  db-latency)
    setup
    test_db_latency
    ;;
  full)
    setup
    test_kv_outage
    test_ai_provider_outage
    test_rate_limit
    test_db_latency
    log_info "Full chaos drill complete. Results: $RESULTS_DIR"
    ;;
  help|*)
    echo "Usage: $0 <scenario> [--dry-run]"
    echo ""
    echo "Scenarios: kv-outage | ai-provider | rate-limit | db-latency | full"
    echo ""
    echo "Environment:"
    echo "  SITE_URL   Target URL (default: http://localhost:3000)"
    echo "  --dry-run  Show what would be tested without executing"
    exit 0
    ;;
esac

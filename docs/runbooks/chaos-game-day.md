# Chaos Game Day Runbook

> **R-010**: No production chaos engineering beyond CI tests.

## Purpose

Quarterly production game days validate that fail-open/closed patterns,
fallback chains, and degradation modes work under real infrastructure failures
— not just mocked CI scenarios.

## Prerequisites

- [ ] All participants have production access (Cloudflare, Supabase, Sentry)
- [ ] Incident response channel (`#incidents`) is staffed
- [ ] Rollback procedures are reviewed (see `docs/rollback-strategy.md`)
- [ ] Game day is scheduled during low-traffic window (Tuesday 10:00-12:00 UTC)
- [ ] Customer-facing status page is updated with maintenance window

---

## Scenario 1: AI Provider Failure

**Objective**: Verify the AI fallback chain (Cloudflare → Gemini → Groq → Cohere)
handles a primary provider outage gracefully.

### Steps

1. **Inject**: Set `CLOUDFLARE_AI_ENABLED=false` in Worker secrets via
   `wrangler secret put CLOUDFLARE_AI_ENABLED --value false`
2. **Observe**: Trigger AI content generation from the admin panel
3. **Verify**:
   - [ ] Content is generated (by fallback provider)
   - [ ] `ai_provider_fallback` Sentry event fires
   - [ ] Response time < 10 s (fallback latency acceptable)
   - [ ] Logger output shows which provider was used
4. **Restore**: `wrangler secret put CLOUDFLARE_AI_ENABLED --value true`

### Expected Behavior

The system falls back to the next available provider transparently. No user-
facing error. Sentry captures a non-blocking warning.

---

## Scenario 2: KV Rate Limiter Outage

**Objective**: Verify rate limiting degrades to per-isolate in-memory limits
when KV is unavailable.

### Steps

1. **Inject**: Set `RATE_LIMIT_MAINTENANCE=1` via KV
   (`wrangler kv:key put --namespace-id=<id> __maintenance__ "1"`)
2. **Observe**: Send 10 requests to a rate-limited endpoint
3. **Verify**:
   - [ ] Requests are NOT rejected with 503 (maintenance mode returns 503
         only if configured — check `lib/rate-limit.ts`)
   - [ ] `rate_limit_kv_failopen` events appear in logs
   - [ ] In-memory rate limiting still enforces per-isolate limits
   - [ ] Sentry alert fires (if configured per R-001)
4. **Restore**: `wrangler kv:key delete --namespace-id=<id> __maintenance__`

### Expected Behavior

Rate limiting degrades gracefully. Requests are still limited per-isolate.
The grace window (60 s) prevents immediate open-gate behavior.

---

## Scenario 3: Supabase Connection Saturation

**Objective**: Verify the application handles database connection exhaustion
without cascading failures.

### Steps

1. **Inject**: Open 55 idle connections to the Supabase pooler (leaving < 5
   available from the 60-connection Pro limit)
2. **Observe**: Trigger admin operations and public page loads
3. **Verify**:
   - [ ] Public pages degrade gracefully (cached content still served)
   - [ ] Admin API returns 503 with clear error message
   - [ ] No unhandled promise rejections in Sentry
   - [ ] Connection timeout is reasonable (< 5 s, not hanging)
4. **Restore**: Close the idle connections

### Expected Behavior

DB-dependent routes return 503. Cached/static content continues serving.
No cascading failures to non-DB services.

---

## Scenario 4: Stripe Webhook Delivery Failure

**Objective**: Verify the webhook DLQ captures failed events for replay.

### Steps

1. **Inject**: Temporarily change the webhook signing secret to an invalid
   value in Worker secrets
2. **Observe**: Trigger a test Stripe event (use Stripe CLI:
   `stripe trigger payment_intent.succeeded`)
3. **Verify**:
   - [ ] Webhook returns 400 (signature mismatch)
   - [ ] Event appears in `webhook_dlq` table
   - [ ] Sentry captures the verification failure
   - [ ] `scripts/drain-dlq.ts` can replay the event after fixing the secret
4. **Restore**: Restore the correct webhook signing secret

### Expected Behavior

Failed webhooks are captured in the DLQ. No payment data is lost. Events can
be replayed after the issue is resolved.

---

## Scenario 5: Deploy Rollback

**Objective**: Verify the rollback procedure works end-to-end.

### Steps

1. **Inject**: Deploy a known-broken build (e.g., a Worker with a syntax error)
2. **Observe**: Post-deploy health check should fail
3. **Verify**:
   - [ ] Health check failure is detected within 60 s
   - [ ] Rollback to previous version completes in < 5 min
   - [ ] All endpoints return to normal after rollback
   - [ ] Sentry alert fires for the broken deploy
4. **Restore**: Deploy the correct version

### Expected Behavior

The gradual rollout (canary) detects the failure. Rollback is automatic or
completes within the documented SLO.

---

## Post-Game Day

1. Write an internal post-mortem for each scenario that revealed unexpected
   behavior.
2. File issues for any gaps discovered.
3. Update this runbook with lessons learned.
4. Schedule the next game day (quarterly cadence).

## Schedule

| Quarter | Date | Scenarios        | Owner            |
| ------- | ---- | ---------------- | ---------------- |
| Q3 2026 | TBD  | 1, 2             | On-call engineer |
| Q4 2026 | TBD  | 3, 4, 5          | On-call engineer |
| Q1 2027 | TBD  | All (regression) | On-call engineer |

## References

- `docs/rollback-strategy.md` — deploy rollback procedures
- `docs/alerting-runbook.md` — alerting rules and escalation
- `docs/incident-response.md` — incident response process
- `docs/tabletop-exercises.md` — tabletop exercise scenarios
- `__tests__/chaos/` — CI-level chaos tests

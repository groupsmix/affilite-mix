# Open Investigations (OI-01 through OI-04)

These items were flagged during the consolidated audit but not fully proven.
Each should be scoped into its own remediation ticket once confirmed.

## OI-01: AI Content Pipeline

**Risk**: Prompt injection, provenance, moderation, human review.

**Investigation scope**:

- Review `lib/ai/prompt-sanitization.ts` for injection resistance
- Verify `AI_MAX_PROMPT_CHARS` ceiling is enforced
- Check that AI-generated content always enters a `draft` state (never auto-published)
- Confirm moderation gates exist before AI content goes live
- Verify content provenance is tracked (AI model, generation timestamp)

**Files to audit**: `lib/ai/content-generator.ts`, `lib/ai/providers.ts`, `lib/ai/prompt-sanitization.ts`, `app/api/cron/ai-generate/route.ts`

## OI-02: Stripe / Webhook Idempotency + Signing Audit

**Risk**: Duplicate event processing, unsigned webhook acceptance.

**Investigation scope**:

- Verify `stripe_events` table enforces idempotency (unique constraint on event ID)
- Confirm `lib/stripe-webhook.ts` validates Stripe signatures before processing
- Check `apply_stripe_membership_event` RPC handles duplicate calls safely
- Verify webhook endpoint rejects events with stale timestamps

**Files to audit**: `lib/stripe-webhook.ts`, `lib/stripe-event-processor.ts`, `lib/dal/stripe-events.ts`, `app/api/membership/webhook/route.ts`, `supabase/migrations/00070_atomic_stripe_event_apply.sql`

## OI-03: Privacy Deletion / Retention Table-by-Table Audit

**Risk**: Incomplete data erasure, unbounded PII retention.

**Investigation scope**:

- Cross-reference `erase_user()` RPC (migration 00088) against all tables with email/PII columns
- Verify `purge_retention()` covers all high-write analytics tables
- Check that no table stores PII without a documented retention policy
- Verify GDPR Art. 15 (right of access) can be fulfilled programmatically

**Files to audit**: `supabase/migrations/00086_extend_purge_retention_experiment_ad.sql`, `supabase/migrations/00088_erase_user_rpc.sql`, all tables listed in `docs/vendor-dpas.md`

**Partially addressed**: `erase_user()` RPC covers 7 tables. `purge_retention()` covers 9 tables. Need to verify completeness.

## OI-04: Operational Game Days

**Risk**: Untested failure modes lead to extended outages.

**Recommended drills**:

1. **Queue failure**: Disable CLICK_QUEUE binding, verify fallback to direct DB write
2. **Supabase outage**: Simulate DB unavailability, verify middleware stale-while-error cache
3. **R2 failure**: Disable R2 credentials, verify upload route returns 503
4. **Bad migration**: Apply a deliberately broken migration to staging, verify rollback procedure
5. **Bad deploy**: Deploy a worker with a missing secret, verify deploy-preflight catches it
6. **Rate limiter failure**: Disable KV binding, verify grace period then fail-closed behavior

**Tracking**: Each drill should produce a postmortem document using the template in `docs/templates/postmortem.md`.

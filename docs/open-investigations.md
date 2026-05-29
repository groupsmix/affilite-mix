# Open Investigations (OI-01 through OI-04)

These items were flagged during the consolidated audit but not fully proven.
Each should be scoped into its own remediation ticket once confirmed.

## OI-01: AI Content Pipeline — ✅ CLOSED (Season 8)

**Risk**: Prompt injection, provenance, moderation, human review.

**Investigation scope**:

- Review `lib/ai/prompt-sanitization.ts` for injection resistance
- Verify `AI_MAX_PROMPT_CHARS` ceiling is enforced
- Check that AI-generated content always enters a `draft` state (never auto-published)
- Confirm moderation gates exist before AI content goes live
- Verify content provenance is tracked (AI model, generation timestamp)

**Files to audit**: `lib/ai/content-generator.ts`, `lib/ai/providers.ts`, `lib/ai/prompt-sanitization.ts`, `app/api/cron/ai-generate/route.ts`

**Resolution (S8-F7):** All investigation items verified with contract tests in `__tests__/ai/oi-01-auto-publish-gate.test.ts`:

- AI cron handler (`app/api/cron/ai-generate/route.ts`) sets status to `"pending"` or `"rejected"` — never `"published"` or `"approved"`.
- `createAIDraft` input type omits `reviewed_at`/`reviewed_by`, making it physically impossible for the AI pipeline to mark content as human-reviewed.
- `GeneratedContent` type includes `provider` and `model` fields for provenance.
- AI-generated watermark (`<meta name="ai-generated">`) prepended to every body (EU AI Act Art. 50).

## OI-02: Stripe / Webhook Idempotency + Signing Audit — ✅ CLOSED (Season 8)

**Risk**: Duplicate event processing, unsigned webhook acceptance.

**Investigation scope**:

- Verify `stripe_events` table enforces idempotency (unique constraint on event ID)
- Confirm `lib/stripe-webhook.ts` validates Stripe signatures before processing
- Check `apply_stripe_membership_event` RPC handles duplicate calls safely
- Verify webhook endpoint rejects events with stale timestamps

**Files to audit**: `lib/stripe-webhook.ts`, `lib/stripe-event-processor.ts`, `lib/dal/stripe-events.ts`, `app/api/membership/webhook/route.ts`, `supabase/migrations/00070_atomic_stripe_event_apply.sql`

**Resolution (S8-F8):** All investigation items verified with contract tests in `__tests__/contract/oi-02-stripe-contract.test.ts`:

- `constructStripeEvent` rejects missing, invalid, stale, and tampered signatures (HMAC-SHA256 + constant-time comparison).
- `applyStripeEventAtomic` calls `apply_stripe_membership_event` Postgres RPC with `ON CONFLICT DO NOTHING` idempotency.
- `processStripeEvent` detects and skips duplicate events.
- `stripe_events` DAL uses unique violation (code `23505`) for deduplication.

## OI-03: Privacy Deletion / Retention Table-by-Table Audit — ✅ CLOSED (Season 8)

**Risk**: Incomplete data erasure, unbounded PII retention.

**Investigation scope**:

- Cross-reference `erase_user()` RPC (migration 00088) against all tables with email/PII columns
- Verify `purge_retention()` covers all high-write analytics tables
- Check that no table stores PII without a documented retention policy
- Verify GDPR Art. 15 (right of access) can be fulfilled programmatically

**Files to audit**: `supabase/migrations/00086_extend_purge_retention_experiment_ad.sql`, `supabase/migrations/00088_erase_user_rpc.sql`, all tables listed in `docs/vendor-dpas.md`

**Resolution (S8-F9):** Full PII-table-to-RPC coverage map created (`docs/pii-table-coverage.md`). Contract tests in `__tests__/contract/oi-03-pii-coverage.test.ts` verify:

- `erase_subject_data()` covers all 7 user-facing PII tables (site-scoped erasure).
- `erase_user()` covers all 7 user-facing PII tables (global erasure).
- `purge_retention()` covers all 9 analytics/event tables with defined retention windows.
- Admin tables (`admin_users`, `subject_restrictions`, `gdpr_objections`) are excluded by design — admin offboarding and legal holds.

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

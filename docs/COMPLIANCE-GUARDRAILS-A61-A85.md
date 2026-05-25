# Compliance Guardrails A61-A85

> **Status**: In Progress — Applied 2026-05-25  
> **Scope**: Privacy, security, resilience, and regulatory compliance fixes for findings A61 through A85.

---

## A61: PII Map — Field-Level Classification

### Resolution

Added explicit field-level classification comments to all sensitive columns in migration `2026052501_audit_sensitivity_compliance.sql`:

| Field | Classification | Protection |
|-------|---------------|------------|
| `admin_users.password_hash` | SENSITIVE | bcrypt, auto-rehash on login |
| `admin_users.totp_secret` | SENSITIVE | AES-256-GCM at rest |
| `admin_users.reset_token` | SENSITIVE | SHA-256 hash, 1h expiry |
| `newsletter_subscribers.confirmation_token` | SENSITIVE | SHA-256 hash, timing-safe compare |
| `newsletter_subscribers.unsubscribe_token` | SENSITIVE | SHA-256 hash, timing-safe compare |
| `affiliate_clicks.ip_prefix` | ONLINE IDENTIFIER | /24 prefix only, never full IP |
| `affiliate_clicks.fingerprint` | ONLINE IDENTIFIER | HMAC-SHA256, not reversible |
| `quiz_submissions.answers` | PII | User-generated, 2-year retention |
| `community_comments.content` | PII | Moderated, erased on Art. 17 request |

### Remaining Work
- [ ] Populate DPIA re-validation ticket for affiliate tracking + AI features
- [ ] Document lawful-basis review for AI provider data flows

---

## A62: GDPR Rights — Enhanced Audit & Erasure

### Resolution

1. **Created `erasure_requests` table** for GDPR Art. 17 workflow tracking with status machine (`pending` → `in_progress` → `completed`/`failed`).
2. **Added `sensitivity` column to `audit_log`** for compliance reporting (low/medium/high/critical).
3. **Added immutable audit trigger** — `audit_log` rows cannot be `UPDATE`d or `DELETE`d.
4. **Login audit events** now classified as `critical` sensitivity.

### Remaining Work
- [ ] Build admin UI for erasure request queue
- [ ] Add automated erasure sweep (data-retention cron)
- [ ] Add data-export (portability) endpoint

---

## A63: CCPA/CPRA — Consent Log Schema

### Resolution

1. Hardened `consent_log` schema with `categories` (JSONB), `gpc_signal` (boolean), and `banner_version` columns.
2. GPC detection already implemented in cookie-consent component.

### Remaining Work
- [ ] Prove sale/share classification for ad/affiliate networks
- [ ] Add "Limit Sensitive Use" mechanism if applicable
- [ ] Connect GPC state to every tracker/ad/affiliate event path

---

## A64: HIPAA — PHI Guardrail

### Resolution

Added `content_warning` column to `quiz_submissions` as a soft guardrail. The application layer validates before insert to flag potential health data.

### Remaining Work
- [ ] Add explicit product/ToS guardrail preventing health data collection
- [ ] Add AI prompt PII blocking (see A72)

---

## A65: PCI-DSS — SAQ A Evidence

### Resolution

- RoPA already confirms SAQ A scope: no PAN stored, Stripe vaults card data.
- Stripe customer/subscription identifiers stored only.

### Remaining Work
- [ ] Complete SAQ A documentation
- [ ] Add Stripe webhook log scrubbing verification
- [ ] Confirm no PAN in logs/comments/AI prompts

---

## A66: SOC 2 TSC Mapping

### Resolution

- TSC mapping exists across Security, Availability, Processing Integrity, Confidentiality, and Privacy.
- Added sensitivity classification to audit events for CC7.2 evidence.

### Remaining Work
- [ ] Add ticket links and control owners
- [ ] Deploy access review schedule
- [ ] Add DR test evidence

---

## A67: ISO 27001 Annex A

### Resolution

- Annex A map exists with repo controls identified.
- Process/HR/physical controls documented as out-of-repo scope.

### Remaining Work
- [ ] Create Statement of Applicability
- [ ] Add control owners and internal audit evidence
- [ ] Document supplier-review cadence

---

## A68: WCAG 2.2 AA

### Status: FAIL (requires dedicated accessibility sprint)

Known blockers:
- Contrast below 4.5:1 in some components
- Dark-mode focus visibility
- AI-generated images missing alt text
- Status messages not announced
- Data-table sort controls not keyboard accessible

### Required Actions
- [ ] Dedicated accessibility audit and remediation sprint
- [ ] Add automated axe-core testing to CI
- [ ] Implement keyboard navigation for data tables

---

## A69: Cookie/Consent Banner

### Resolution

- Granular categories, reject non-essential, manage preferences, GPC handling all implemented.
- Hardened `consent_log` schema for evidence storage.

### Remaining Work
- [ ] Verify client-side posting to consent logging route
- [ ] Prove consent-before-fire for every analytics/ad/affiliate script
- [ ] IAB TCF CMP certification if needed for ad networks

---

## A70: ToS/PP/DPA vs Product Behavior

### Resolution

- Privacy page is comprehensive (AI, cookies, processors, retention, GDPR, CCPA).
- Terms page exists but is sparser.

### Remaining Work
- [ ] Expand Terms with membership/payment terms
- [ ] Add public DPA/customer processing terms
- [ ] Add AI disclosure consistency verification

---

## A71: Data Residency

### Resolution

- Vendor DPA register and Schrems II TIA identify: Supabase EU, Cloudflare global edge, Stripe/Resend/Sentry US/global.
- SCCs/DPF-style transfer mechanisms documented.

### Remaining Work
- [ ] Add per-user/per-tenant residency enforcement
- [ ] Add runtime proof of log/object/db region
- [ ] Cloudflare localization configuration evidence

---

## A72: EU AI Act

### Resolution

- AI governance documents: admin-only draft generation, human approval before publishing.

### Remaining Work
- [ ] Add persistent AI labels to generated content
- [ ] Add watermark or machine-readable generated-content metadata
- [ ] Add prohibited-use guardrail tests
- [ ] Add prompt PII blocking
- [ ] Add human-oversight audit logs

---

## A73-A85: Technical Resilience

### Resolution

Created `lib/resilient-fetch.ts` providing:
- **Timeout** (configurable, default 10s)
- **Retry** with exponential backoff + jitter
- **Circuit breaker** integration (reuses existing breaker)
- **Idempotency key** generation for mutating methods
- **Correlation ID** propagation
- **Bounded idempotency store** (1,000-entry cap, 5-min TTL)
- **Fallback response** support

### Files Created/Modified

| File | Change |
|------|--------|
| `lib/resilient-fetch.ts` | NEW — outbound call wrapper |
| `lib/audit-log.ts` | MODIFIED — sensitivity, awaitDurable, immutable sink |
| `lib/totp.ts` | MODIFIED — SHA-1 → SHA-256 |
| `lib/totp-encryption.ts` | MODIFIED — fail closed in prod/staging |
| `lib/supabase-server.ts` | MODIFIED — header spoofing protection |
| `middleware.ts` | MODIFIED — localhost fallback warning, trusted header |
| `app/api/track/click/route.ts` | MODIFIED — HMAC fail-closed |
| `app/api/auth/login/route.ts` | MODIFIED — login audit with sensitivity |
| `app/api/admin/upload/route.ts` | MODIFIED — upload audit sensitivity |
| `supabase/migrations/2026052501_*.sql` | NEW — schema hardening |
| `docs/COMPLIANCE-GUARDRAILS-A61-A85.md` | NEW — this document |

### Remaining Work
- [ ] Wrap all external calls with `resilientFetch`
- [ ] Add global retry ceilings and per-tenant rate budgets
- [ ] Add chaos tests (staged fault-injection matrix)
- [ ] Add cold-start benchmarks
- [ ] Add metric-label allowlist and bounded-cardinality schema
- [ ] Add job state machine with checkpoint/resume/progress
- [ ] Add graceful shutdown tests for Workers

# Re-Audit Verification — Season 3 & Season 6e Findings

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main` (post PRs #694–#698)
**Date:** 2026-05-29
**Auditor:** Devin (principal-engineer re-audit agent)
**Scope:** Verify fixes applied by PRs #694–#698 against Season 3 (A61–A85) and Season 6e (A152–A162) audit findings.

---

## Methodology

1. Read both original audit reports in full.
2. Reviewed merged PRs: #694 (DRY/error-handling cleanup), #695 (rate limiter LRU + absolute session lifetime), #696 (GDPR export, cookie consent, circuit breakers, AI cron checkpoint), #697 (Season 8 docs), #698 (newsletter email i18n).
3. For each finding, verified against the current codebase on `main` at commit `42510716`.
4. Re-ran critical audits: A61 PII map, A62 GDPR rights, A74 external call hygiene, A152 money-action map.
5. Checked for new issues introduced by fixes.

---

## Season 3 Findings Verification

### A61 — PII Map

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)            | Notes                                                                                                                     |
| ---------- | ----------------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| S3-001     | Low               | STILL OPEN | `docs/ropa.md`                         | `drip_enrollments` still missing from RoPA table. Not addressed by any PR.                                                |
| S3-002     | Info              | STILL OPEN | `types/database.ts:47`                 | `AffiliateClickRow` still does not include `ip_prefix` or `fingerprint` fields. Documentation-only type drift — low risk. |
| S3-003     | Low               | STILL OPEN | `app/api/cron/data-retention/route.ts` | `consent_log` indefinite retention still not documented as explicit retention decision in RoPA.                           |

### A62 — GDPR Rights

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                         | Notes                                                                                                                                                                                                                           |
| ---------- | ----------------- | ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-004     | Medium            | **FIXED**  | PR #696 — `app/api/user/data-export/route.ts:1-103` | New self-service `GET /api/user/data-export?email=` endpoint returns JSON download with `Content-Disposition: attachment`. Rate-limited (3/15min, fail-closed). Queries 4 tables (newsletter, comments, quizzes, price_alerts). |
| S3-005     | Low               | STILL OPEN | `app/api/admin/privacy/user/route.ts:55-112`        | Admin access export queries 7 tables + drip_enrollments but still does not include `consent_log` records. The new self-service endpoint (S3-004 fix) also omits consent_log.                                                    |
| S3-006     | Low               | STILL OPEN | `app/api/admin/privacy/restrict/route.ts`           | Restriction recorded in `subject_restrictions` but no downstream check exists in newsletter send, drip campaigns, or analytics.                                                                                                 |
| S3-007     | Info              | STILL OPEN | Privacy endpoints                                   | All GDPR endpoints still require `super_admin`. New `/api/user/data-export` (S3-004 fix) provides self-service access export — partial mitigation.                                                                              |

### A63 — CCPA / CPRA

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                       | Notes                                                                                                                                                      |
| ---------- | ----------------- | ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-008     | Medium            | **FIXED**  | PR #696 — `app/(public)/privacy/page.tsx:247-284` | CCPA section added with: categories of PI, purposes, "we do not sell or share", GPC signal honoring, CPRA sensitive PI statement. Both English and Arabic. |
| S3-009     | Low               | STILL OPEN | `app/(public)/components/cookie-consent-cmp.tsx`  | No server-side `Sec-GPC` header check in middleware. Client-side GPC detection works.                                                                      |

### A66 — SOC 2 TSC Mapping

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)     | Notes                                                                                                             |
| ---------- | ----------------- | ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| S3-010     | Medium            | STILL OPEN | `docs/soc2-controls-mapping.md` | CC6.2/CC6.3 provisioning/deprovisioning checklists still incomplete. Process control — not addressed by code PRs. |
| S3-011     | Low               | STILL OPEN | `docs/soc2-controls-mapping.md` | CC1.2/CC1.4 still "In progress". Process/HR control.                                                              |
| S3-012     | Info              | N/A        | —                               | No action needed (per original audit).                                                                            |

### A67 — ISO 27001 Annex A Coverage

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                                           |
| ---------- | ----------------- | ---------- | --------------------------- | ------------------------------------------------------------------------------- |
| S3-013     | Medium            | STILL OPEN | `docs/iso27001-annex-a.md`  | A.5.13 labelling still "Partial". No runtime data-classification tagging added. |
| S3-014     | Low               | STILL OPEN | `docs/iso27001-annex-a.md`  | A.8.10 deletion verification — no post-purge verification query added.          |
| S3-015     | Low               | STILL OPEN | `docs/iso27001-annex-a.md`  | A.5.23 cloud service DPA review cadence not added.                              |

### A68 — WCAG 2.2 AA

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                       | Notes                                                               |
| ---------- | ----------------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| S3-016     | Medium            | STILL OPEN | `app/admin/(dashboard)/products/product-form.tsx` | `image_alt` still not validated as non-empty on save.               |
| S3-017     | Low               | STILL OPEN | `app/(public)/components/cookie-consent-cmp.tsx`  | Still using `vanilla-cookieconsent`. Upgrade not in scope of fixes. |
| S3-018     | Low               | STILL OPEN | `app/(public)/accessibility/page.tsx`             | No conformance date or audit methodology added.                     |
| S3-019     | Info              | N/A        | —                                                 | No action needed (per original audit).                              |

### A69 — Cookie / Consent Banner

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                                                    | Notes                                                                                                                                            |
| ---------- | ----------------- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S3-020     | Medium            | STILL OPEN | `app/(public)/components/cookie-consent-cmp.tsx`                               | Beacon consent-proof logging documented but clarity not improved. Low-priority; behaviour is correct.                                            |
| S3-021     | Low → FIXED       | **FIXED**  | PR #696 — `app/(public)/components/cookie-consent-cmp.tsx:126,164,170,235,241` | "Reject All" button added via `acceptNecessaryBtn: "Reject All"` (EN) / `"رفض الكل"` (AR). `equalWeightButtons: true` enforces equal prominence. |
| S3-022     | Info              | N/A        | —                                                                              | No action needed (per original audit).                                                                                                           |

### A70 — ToS / PP vs Actual Behaviour

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)     | Notes                                                                                                                                             |
| ---------- | ----------------- | ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-023     | Medium            | STILL OPEN | `app/(public)/privacy/page.tsx` | Privacy policy still does not explicitly mention drip/lifecycle email campaigns. The CCPA section was added but drip campaign disclosure was not. |
| S3-024     | Low               | STILL OPEN | `app/(public)/privacy/page.tsx` | Sub-processor list still not in public privacy policy.                                                                                            |
| S3-025     | Low               | STILL OPEN | `app/(public)/privacy/page.tsx` | Retention schedule summary still missing from privacy policy.                                                                                     |

### A71 — Data Residency

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                |
| ---------- | ----------------- | ---------- | --------------------------- | ---------------------------------------------------- |
| S3-026     | Low               | STILL OPEN | `docs/data-residency.md`    | Cloudflare DLS configuration evidence still missing. |
| S3-027     | Info              | N/A        | —                           | No action needed.                                    |

### A72 — EU AI Act

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)       | Notes                                                  |
| ---------- | ----------------- | ---------- | --------------------------------- | ------------------------------------------------------ |
| S3-028     | Low               | STILL OPEN | `docs/ai-system-technical-doc.md` | Monitoring section still lacks output quality metrics. |
| S3-029     | Info              | N/A        | —                                 | No action needed.                                      |
| S3-030     | Info              | N/A        | —                                 | No action needed.                                      |

### A73 — Worst-Case Input

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)         | Notes                                                                     |
| ---------- | ----------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------- |
| S3-031     | Medium            | STILL OPEN | `app/api/newsletter/route.ts`       | No route-specific body size limit added. Still relies on global 1 MB cap. |
| S3-032     | Low               | STILL OPEN | `docs/worst-case-input-analysis.md` | Coverage not extended to additional POST endpoints.                       |
| S3-033     | Low               | STILL OPEN | `lib/sanitize-html.ts`              | No total input length guard before parsing.                               |

### A74 — External Call Hygiene

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                      | Notes                                                                                                                                                                                     |
| ---------- | ----------------- | ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-034     | Medium            | **FIXED**  | PR #696 — `lib/supabase-circuit-breaker.ts:1-21` | Circuit breaker created for Supabase using the existing `CircuitBreaker` class. Config: 5-failure threshold, 15s recovery, 120s reset. Used in `app/api/cron/ai-generate/route.ts:14,97`. |
| S3-035     | Medium            | STILL OPEN | `app/api/newsletter/route.ts:272`                | Resend email send still has no explicit timeout or retry. Raw `fetch()` call without `fetchWithTimeout`.                                                                                  |
| S3-036     | Low               | STILL OPEN | `lib/sitemap-ping.ts`                            | Sitemap ping failure logging not added.                                                                                                                                                   |

### A75 — Cache

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)     | Notes                                    |
| ---------- | ----------------- | ---------- | ------------------------------- | ---------------------------------------- |
| S3-037     | Low               | STILL OPEN | `lib/middleware-site-lookup.ts` | No stale-while-revalidate pattern added. |
| S3-038     | Info              | N/A        | —                               | No action needed.                        |

### A76 — Retry Storms / Thundering Herd

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                                                                                                                                           |
| ---------- | ----------------- | ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-039     | Low               | N/A        | —                           | No action needed (per original audit).                                                                                                                                          |
| S3-040     | Low               | N/A        | —                           | No action needed (per original audit).                                                                                                                                          |
| S3-041     | Medium            | STILL OPEN | `lib/rate-limit.ts`         | `KV_GRACE_MS` still defaults to 60s. Per-route `graceMs` override exists but not explicitly set on auth routes. PR #695 increased LRU cap to 50K (related but different issue). |

### A77 — Unbounded Loops

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)            | Notes                          |
| ---------- | ----------------- | ---------- | -------------------------------------- | ------------------------------ |
| S3-042     | Info              | N/A        | —                                      | No action needed.              |
| S3-043     | Low               | STILL OPEN | `app/api/cron/data-retention/route.ts` | No max-iterations guard added. |
| S3-044     | Info              | N/A        | —                                      | No action needed.              |

### A78 — Unbounded Memory

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)           | Notes                                                                                                                                                                                         |
| ---------- | ----------------- | ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-045     | Low               | STILL OPEN | `lib/single-flight.ts`                | No inflight map cap added.                                                                                                                                                                    |
| S3-046     | Low               | **FIXED**  | PR #695 — `lib/rate-limit.ts:237-319` | LRU eviction implemented with `lastAccess` tracking. Cap increased from 10K to 50K (configurable via `RATE_LIMIT_MEMORY_MAX_ENTRIES`, clamped [1K, 500K]). True LRU eviction in `lruEvict()`. |
| S3-047     | Info              | N/A        | —                                     | No action needed.                                                                                                                                                                             |

### A79 — Cold Start

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                                                   |
| ---------- | ----------------- | ---------- | --------------------------- | --------------------------------------------------------------------------------------- |
| S3-048     | Low               | N/A        | —                           | No action needed.                                                                       |
| S3-049     | Low               | N/A        | —                           | No action needed.                                                                       |
| S3-050     | Medium            | STILL OPEN | `lib/supabase-server.ts`    | Per-request Supabase client creation still present. No module-level client cache added. |

### A80 — Cost

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                       |
| ---------- | ----------------- | ---------- | --------------------------- | ----------------------------------------------------------- |
| S3-051     | Low               | STILL OPEN | `docs/cost-controls.md`     | Still references non-existent `tools/cost/daily-report.ts`. |
| S3-052     | Info              | N/A        | —                           | No action needed.                                           |

### A81 — Log / Metric Cardinality

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                     |
| ---------- | ----------------- | ---------- | --------------------------- | ----------------------------------------- |
| S3-053     | Info              | N/A        | —                           | No action needed.                         |
| S3-054     | Low               | STILL OPEN | `lib/logger.ts`             | No per-route log-level override.          |
| S3-055     | Low               | STILL OPEN | `lib/log-redaction.ts`      | Redaction still shallow (one level deep). |

### A82 — Long-Running Jobs

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                                     | Notes                                                                                                                                 |
| ---------- | ----------------- | ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| S3-056     | Medium            | **FIXED**  | PR #696 — `app/api/cron/ai-generate/route.ts:43-50,127-128,140` | Resumable cursor checkpoint added: `?cursor=<siteIdx>:<articleIdx>`. Cursor returned in response for external orchestrator to resume. |
| S3-057     | Low               | STILL OPEN | `app/api/cron/price-scrape/route.ts`                            | No batch checkpointing for price scraping.                                                                                            |

### A83 — Graceful Shutdown

| Finding ID | Original Severity | Status | Evidence (file:line or PR#) | Notes                                |
| ---------- | ----------------- | ------ | --------------------------- | ------------------------------------ |
| S3-058     | Low               | N/A    | —                           | No action needed (CF Workers model). |
| S3-059     | Info              | N/A    | —                           | No action needed.                    |

### A84 — Fault Tolerance

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                       | Notes                                                                                                                                    |
| ---------- | ----------------- | ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| S3-060     | Medium            | **FIXED**  | PR #696 — `lib/supabase-circuit-breaker.ts:17-21` | Circuit breaker for Supabase created. Currently wired into AI generate cron. Other routes not yet wired. See "New Issues" section below. |
| S3-061     | Low               | STILL OPEN | `app/api/newsletter/route.ts`                     | Failed email sends still not queued for retry. No DLQ mechanism.                                                                         |

### A85 — SLO Math

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)      | Notes                                                                |
| ---------- | ----------------- | ---------- | -------------------------------- | -------------------------------------------------------------------- |
| S3-062     | Medium            | STILL OPEN | `terraform/cloudflare/alerts.tf` | Alert destinations still not configured.                             |
| S3-063     | Low               | STILL OPEN | `docs/slo-definitions.md`        | Click tracking and newsletter still lack dedicated burn-rate alerts. |
| S3-064     | Low               | STILL OPEN | `terraform/cloudflare/alerts.tf` | Bootstrapping documentation not added.                               |

---

## Season 6e Findings Verification

### A152 — Money-Relevant Action Map

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)             | Notes                                                                                                                                                        |
| ---------- | ----------------- | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A152-01    | Info              | N/A        | —                                       | No action needed.                                                                                                                                            |
| A152-02    | Info              | N/A        | —                                       | No action needed.                                                                                                                                            |
| A152-03    | Info              | N/A        | —                                       | No action needed.                                                                                                                                            |
| A152-04    | Low               | STILL OPEN | `lib/stripe-event-processor.ts:181-222` | Dispute handling logs warning but no automated T&S alert (Sentry/webhook). PR #694 added `captureException` to 4 cron routes but not to the dispute handler. |
| A152-05    | Info              | N/A        | —                                       | No action needed.                                                                                                                                            |
| A152-06    | Info              | N/A        | —                                       | Not applicable.                                                                                                                                              |

### A153 — Signup Pipeline

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)           | Notes                                                                     |
| ---------- | ----------------- | ---------- | ------------------------------------- | ------------------------------------------------------------------------- |
| A153-01    | Medium            | STILL OPEN | `app/api/auth/login/route.ts`         | No device fingerprinting integrated. Expected — significant feature work. |
| A153-02    | Low               | STILL OPEN | `lib/get-client-ip.ts`                | No IP risk scoring service integrated.                                    |
| A153-03    | Low               | STILL OPEN | `lib/security/disposable-email.ts`    | No catch-all domain detection added.                                      |
| A153-04    | Info              | N/A        | —                                     | No action needed.                                                         |
| A153-05    | Info              | N/A        | —                                     | Not applicable.                                                           |
| A153-06    | Low               | STILL OPEN | `app/api/auth/login/route.ts:165-227` | No progressive delays (exponential backoff) added to rate limiting.       |
| A153-07    | Low               | STILL OPEN | `lib/turnstile.ts`                    | `ENABLE_TURNSTILE` not enforced fail-closed in production.                |
| A153-08    | Info              | N/A        | —                                     | No action needed.                                                         |

### A154 — Account Takeover (ATO) Defenses

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)           | Notes                                                |
| ---------- | ----------------- | ---------- | ------------------------------------- | ---------------------------------------------------- |
| A154-01    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-02    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-03    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-04    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-05    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-06    | Medium            | STILL OPEN | `app/api/auth/login/route.ts:480-536` | No suspicious-login email notifications implemented. |
| A154-07    | Info              | N/A        | —                                     | No action needed.                                    |
| A154-08    | Info              | N/A        | —                                     | No action needed.                                    |

### A155 — Payments Fraud

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                    | Notes                                                                                                                                        |
| ---------- | ----------------- | ---------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A155-01    | Medium            | STILL OPEN | `app/api/membership/checkout/route.ts:159-181` | No explicit `request_three_d_secure` parameter in Stripe checkout session creation. Stripe's built-in SCA applies automatically for EU/PSD2. |
| A155-02    | Info              | N/A        | —                                              | No action needed.                                                                                                                            |
| A155-03    | Info              | N/A        | —                                              | No action needed.                                                                                                                            |
| A155-04    | Low               | STILL OPEN | `lib/stripe-event-processor.ts:181-222`        | No `dispute_flags` table or cross-site chargeback correlation.                                                                               |
| A155-05    | Low               | STILL OPEN | `app/api/membership/checkout/route.ts:159-181` | No Stripe Radar rules configured server-side.                                                                                                |
| A155-06    | Info              | N/A        | —                                              | No action needed.                                                                                                                            |
| A155-07    | Info              | N/A        | —                                              | No action needed.                                                                                                                            |

### A156 — Content Moderation

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                                           |
| ---------- | ----------------- | ---------- | --------------------------- | ------------------------------------------------------------------------------- |
| A156-01    | Info              | N/A        | —                           | No action needed.                                                               |
| A156-02    | Info              | N/A        | —                           | No action needed.                                                               |
| A156-03    | Medium            | STILL OPEN | N/A                         | No perceptual hash matching for UGC images. Third-party integration (PhotoDNA). |
| A156-04    | Info              | N/A        | —                           | No action needed.                                                               |
| A156-05    | Low               | STILL OPEN | N/A                         | No moderation SLA documented.                                                   |
| A156-06    | Low               | STILL OPEN | N/A                         | No appeal mechanism for rejected UGC.                                           |
| A156-07    | Info              | N/A        | —                           | No action needed.                                                               |

### A157 — Anti-Scraping

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                             |
| ---------- | ----------------- | ---------- | --------------------------- | ------------------------------------------------- |
| A157-01    | Info              | N/A        | —                           | No action needed.                                 |
| A157-02    | Info              | N/A        | —                           | No action needed.                                 |
| A157-03    | Low               | STILL OPEN | N/A                         | No behavioral bot detection at application level. |
| A157-04    | Low               | STILL OPEN | N/A                         | No honeypot form fields added.                    |
| A157-05    | Info              | N/A        | —                           | No action needed.                                 |
| A157-06    | Info              | N/A        | —                           | No action needed.                                 |

### A158 — Referral / Loyalty / Promo Abuse

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#)                    | Notes                                                          |
| ---------- | ----------------- | ---------- | ---------------------------------------------- | -------------------------------------------------------------- |
| A158-01    | Info              | N/A        | —                                              | Not applicable.                                                |
| A158-02    | Info              | N/A        | —                                              | Not applicable.                                                |
| A158-03    | Info              | N/A        | —                                              | Not applicable (conditional).                                  |
| A158-04    | Info              | N/A        | —                                              | No action needed.                                              |
| A158-05    | Low               | STILL OPEN | `app/api/membership/checkout/route.ts:141-145` | No Stripe customer ID cross-reference for multi-account abuse. |

### A159 — Report Channels

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                             |
| ---------- | ----------------- | ---------- | --------------------------- | --------------------------------- |
| A159-01    | Info              | N/A        | —                           | No action needed.                 |
| A159-02    | Info              | N/A        | —                           | No action needed.                 |
| A159-03    | Low               | STILL OPEN | N/A                         | No in-app "Report" button on UGC. |
| A159-04    | Info              | N/A        | —                           | No action needed.                 |

### A160 — Sanctions Screening

| Finding ID | Original Severity | Status | Evidence (file:line or PR#) | Notes                                   |
| ---------- | ----------------- | ------ | --------------------------- | --------------------------------------- |
| A160-01    | Info              | N/A    | —                           | Stripe handles payment-level screening. |
| A160-02    | Info              | N/A    | —                           | Observation — verify Cloudflare WAF.    |

### A161 — KYC / KYB

| Finding ID | Original Severity | Status | Evidence (file:line or PR#) | Notes                           |
| ---------- | ----------------- | ------ | --------------------------- | ------------------------------- |
| A161-01    | Info              | N/A    | —                           | Not required for current model. |
| A161-02    | Info              | N/A    | —                           | Not applicable.                 |

### A162 — Trust & Safety Telemetry Privacy

| Finding ID | Original Severity | Status     | Evidence (file:line or PR#) | Notes                                                                                    |
| ---------- | ----------------- | ---------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| A162-01    | Info              | N/A        | —                           | No action needed.                                                                        |
| A162-02    | Info              | N/A        | —                           | No action needed.                                                                        |
| A162-03    | Info              | N/A        | —                           | No action needed.                                                                        |
| A162-04    | Info              | N/A        | —                           | No action needed.                                                                        |
| A162-05    | Info              | N/A        | —                           | No action needed.                                                                        |
| A162-06    | Low               | STILL OPEN | `lib/audit-log.ts:6-15`     | Audit log still stores raw IP for 365-day window. Consider /24 truncation at write time. |
| A162-07    | Info              | N/A        | —                           | No action needed.                                                                        |

---

## Critical Re-Audit Results

### A61 — PII Map (Re-run)

The PII map from Season 3 remains accurate. Key observations on current codebase:

| Change                                             | Status                                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New endpoint `GET /api/user/data-export` (PR #696) | Self-service export queries `newsletter_subscribers`, `comments`, `quiz_submissions`, `price_alerts`. Does NOT query `drip_enrollments`, `wrist_shots`, `memberships`, `consent_log`, or `affiliate_clicks`. The admin endpoint covers more tables. |
| `types/database.ts` AffiliateClickRow              | Still missing `ip_prefix` and `fingerprint` fields (S3-002 still open).                                                                                                                                                                             |
| No new PII collection introduced by fixes          | Confirmed — no new PII fields or tables added.                                                                                                                                                                                                      |

### A62 — GDPR Rights (Re-run)

| Right                | Article | Status       | Change since S3 audit                                                                  |
| -------------------- | ------- | ------------ | -------------------------------------------------------------------------------------- |
| Access (data export) | Art. 15 | Improved     | New self-service endpoint `/api/user/data-export` (PR #696). Admin endpoint unchanged. |
| Rectification        | Art. 16 | Unchanged    | Still admin-only.                                                                      |
| Erasure (RTBF)       | Art. 17 | Unchanged    | Still admin-only, covers correct tables.                                               |
| Restriction          | Art. 18 | Unchanged    | S3-006 still open — no downstream processor checks.                                    |
| Portability          | Art. 20 | **Improved** | Self-service JSON export now available (S3-004 fix). No CSV format option yet.         |
| Objection            | Art. 21 | Unchanged    | Still functional.                                                                      |
| Automated decisions  | Art. 22 | N/A          | No automated decisions on subjects.                                                    |

**Gap:** Self-service export (`/api/user/data-export`) covers 4 tables but the admin export covers 7+. Consider aligning table coverage.

### A74 — External Call Hygiene (Re-run)

| External Call  | Timeout         | Retry | Circuit Breaker   | Fallback         | Change                                                                   |
| -------------- | --------------- | ----- | ----------------- | ---------------- | ------------------------------------------------------------------------ |
| AI providers   | 8s              | Yes   | Yes (KV)          | 4-provider chain | Unchanged                                                                |
| Supabase (DB)  | SDK default     | No    | **Yes (new)**     | 503 on failure   | **PR #696: `supabaseBreaker` added** — currently wired into AI cron only |
| Stripe webhook | SDK default     | N/A   | N/A               | DLQ              | Unchanged                                                                |
| Resend (email) | None            | No    | No                | 503              | **Still unprotected** (S3-035 open)                                      |
| Cloudflare KV  | Runtime default | No    | Grace+fail-closed | In-memory        | Unchanged                                                                |
| Sitemap ping   | 8s              | No    | No                | Fire-and-forget  | Unchanged                                                                |

**Key improvement:** Supabase circuit breaker exists but is only wired into the AI cron route. Other routes (newsletter, checkout, privacy endpoints) still call Supabase without circuit breaker protection.

### A152 — Money-Action Map (Re-run)

| Money Action          | Controls                                                          | Change since S6e audit                                                                                                  |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Checkout              | Tier allowlist, Turnstile, IP rate limit, email norm, dedup check | Unchanged. No 3DS2 explicit opt-in added (A155-01 still open).                                                          |
| Webhook               | HMAC verification, idempotency, DLQ                               | Unchanged.                                                                                                              |
| Commission ingest     | CRON_SECRET, dedup, HMAC                                          | **PR #694: DRY refactor** — network loop consolidated into data-driven array. Logic equivalent; no security regression. |
| Chargeback/dispute    | Logs + sets past_due                                              | Unchanged. No automated T&S alert (A152-04 still open).                                                                 |
| Stripe reconciliation | Cron auth, idempotent                                             | Unchanged.                                                                                                              |

**No regressions detected in money-touching paths.**

---

## New Issues Introduced by Fixes

### NI-001 — Supabase circuit breaker scope is narrow

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity       | Low                                                                                                                                                                                                                                                                                                                                                                        |
| Location       | `lib/supabase-circuit-breaker.ts`, `app/api/cron/ai-generate/route.ts:97`                                                                                                                                                                                                                                                                                                  |
| Description    | The Supabase circuit breaker (S3-034/S3-060 fix) is only wired into the AI generate cron route. Other Supabase-dependent routes (newsletter, checkout, privacy, data-retention, etc.) still call Supabase directly without circuit breaker protection. The original findings S3-034 and S3-060 called for wrapping "tenant client calls" broadly, not just the cron route. |
| Recommendation | Integrate `supabaseBreaker.execute()` into `getTenantClient()` or create a wrapper used by all API routes.                                                                                                                                                                                                                                                                 |

### NI-002 — Self-service data export covers fewer tables than admin export

| Field          | Value                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Severity       | Low                                                                                                                                                                                                                                                                |
| Location       | `app/api/user/data-export/route.ts:56-77`                                                                                                                                                                                                                          |
| Description    | The new self-service endpoint exports 4 tables (newsletter, comments, quizzes, price_alerts) while the admin export covers 7 tables (+ memberships, wrist_shots, drip_enrollments). A data subject requesting their own data may not receive complete information. |
| Recommendation | Add `memberships`, `wrist_shots`, and `drip_enrollments` lookups to the self-service export.                                                                                                                                                                       |

### NI-003 — Newsletter email subject not localized

| Field          | Value                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity       | Low                                                                                                                                                                                                                                                                   |
| Location       | `app/api/newsletter/route.ts:281`                                                                                                                                                                                                                                     |
| Description    | PR #698 localized the email body with `siteLocale` but the `subject` line calls `t("newsletter.confirm_subject")` without passing `siteLocale`, so it always defaults to English even when the body is rendered in Arabic. (Flagged by CodeRabbit review on PR #698.) |
| Recommendation | Change to `t("newsletter.confirm_subject", siteLocale)`.                                                                                                                                                                                                              |

---

## Summary

### Season 3 — Fix Verification

| Status         | Count | Finding IDs                                                                                                                                                                                                                                                                                                    |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIXED**      | 6     | S3-004, S3-008, S3-021, S3-034, S3-046, S3-056, S3-060                                                                                                                                                                                                                                                         |
| **STILL OPEN** | 28    | S3-001, S3-002, S3-003, S3-005, S3-006, S3-009, S3-010, S3-011, S3-013, S3-014, S3-015, S3-016, S3-017, S3-018, S3-020, S3-023, S3-024, S3-025, S3-026, S3-028, S3-031, S3-032, S3-033, S3-035, S3-036, S3-037, S3-041, S3-043, S3-045, S3-050, S3-051, S3-054, S3-055, S3-057, S3-061, S3-062, S3-063, S3-064 |
| **N/A / Info** | 20    | S3-007, S3-012, S3-019, S3-022, S3-027, S3-029, S3-030, S3-038, S3-039, S3-040, S3-042, S3-044, S3-047, S3-048, S3-049, S3-052, S3-053, S3-058, S3-059                                                                                                                                                         |

### Season 6e — Fix Verification

| Status         | Count | Finding IDs                                                                                                                                                      |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIXED**      | 0     | —                                                                                                                                                                |
| **STILL OPEN** | 15    | A152-04, A153-01, A153-02, A153-03, A153-06, A153-07, A154-06, A155-01, A155-04, A155-05, A156-03, A156-05, A156-06, A157-03, A157-04, A158-05, A159-03, A162-06 |
| **N/A / Info** | 36    | All others                                                                                                                                                       |

### New Issues from Fixes

| ID     | Severity | Description                                                             |
| ------ | -------- | ----------------------------------------------------------------------- |
| NI-001 | Low      | Supabase circuit breaker wired into AI cron only, not broadly applied   |
| NI-002 | Low      | Self-service data export covers 4/7 tables                              |
| NI-003 | Low      | Newsletter email subject not localized (missing `siteLocale` parameter) |

### PRs Verified

| PR   | Scope                                          | Findings Addressed                                | Verdict                                                                           |
| ---- | ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| #694 | DRY refactor + error handling                  | Not Season 3/6e specific — improves observability | Clean, no regressions                                                             |
| #695 | Rate limiter LRU + session lifetime            | S3-046 (LRU eviction)                             | **S3-046 FIXED**. Session lifetime fix is from Season 4, not S3/S6e.              |
| #696 | GDPR export, consent, circuit breaker, AI cron | S3-004, S3-008, S3-021, S3-034, S3-056, S3-060    | **6 findings FIXED**. 3 new low-severity issues (NI-001, NI-002, NI-003 partial). |
| #697 | Season 8 docs                                  | N/A                                               | Documentation only.                                                               |
| #698 | Newsletter i18n                                | Not S3/S6e finding directly                       | Good improvement, but introduced NI-003.                                          |

---

### Attestation

This re-audit was conducted by automated code analysis of the `groupsmix/affilite-mix` repository at commit `42510716` on branch `main` (2026-05-29). It verifies fixes applied by PRs #694–#698 against Season 3 (A61–A85, 64 findings) and Season 6e (A152–A162, 51 findings) audit reports, and includes a fresh re-run of critical audits A61, A62, A74, and A152 against the current codebase.

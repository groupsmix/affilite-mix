# Final Re-Audit Verification — Wave 3 Fixes (PRs #703–#707)

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main` (commit `2c87810a`)
**Date:** 2026-05-29
**Auditor:** Devin (principal-engineer role)
**Scope:** Verify Wave 3 fixes (PRs #703–#707) against STILL OPEN findings from all three previous re-audit reports.

---

## Previous Re-Audit Reports

| Report | Scope | Key Outcome |
| ------ | ----- | ----------- |
| `reaudit-s4-s5-verification.md` | Season 4 (A86–A100) + Season 5 (A101–A115) | 2 Critical FIXED, 6 High FIXED, 13 High STILL OPEN |
| `reaudit-s3-s6e-verification.md` | Season 3 (A61–A85) + Season 6e (A152–A162) | 7 FIXED, 28 STILL OPEN (S3), 15 STILL OPEN (S6e) |
| `reaudit-s1-s2-verification.md` | Season 1 (A1–A30) + Season 2 (A31–A60) | 3 FIXED, 1 Medium + 16 Low STILL OPEN, 1 Low regression |

---

## Wave 3 Fix PRs Under Review

| PR | Title | Key Changes |
| --- | --- | --- |
| #703 | fix(i18n): pass siteLocale to email subject t() call | Fixes REG-1 regression from PR #698 |
| #704 | fix(infra): circuit breakers, secrets runbook, log sampling, KV monitoring | A98-16, A99-2, A98-6, A99-6, A99-3 |
| #705 | fix(security): add try-catch to atob/JSON.parse + KV error capture + APP_URL validation | A100-3, A100-4, A100-8, A100-14, A100-25 |
| #706 | feat(sites): rename AI Compared domain to compareai.site | Domain rename (config, seeds, migrations, docs) |
| #707 | test: add login integration, Stripe webhook, and requestId logging tests | A86-1, A86-2, A93-2 |

---

## Wave 3 Findings Verification

### PR #704 — Circuit Breakers, Secrets Runbook, Log Sampling, KV Monitoring

| Finding ID | Prev Status | Wave 3 Status | Evidence (file:line) | Verification Notes |
| ---------- | ----------- | ------------- | -------------------- | ------------------ |
| A98-16 | STILL OPEN | ✅ **FIXED** | `lib/supabase-server.ts:160-165` (anon breaker), `lib/server-only/service-role.ts:104-109` (privileged breaker) | Circuit breaker wraps both `getAnonClient()` and `getPrivilegedSupabaseClient()` fetch paths using `getCircuitBreaker()` with threshold 3, recovery 15s. `CircuitOpenError` is caught and logged. Fallback returns 503. |
| A99-2 | STILL OPEN | ✅ **FIXED** | `lib/middleware-site-lookup.ts:17-25,58-84` | New `CircuitBreaker("middleware-site-lookup", { failureThreshold: 3, recoveryTimeoutMs: 10_000 })` wraps the `_fetchSiteRowByDomain()` DB call. Failures fast-fail via `siteLookupBreaker.execute()`. |
| A98-6 | STILL OPEN | ✅ **FIXED** | `docs/secrets-rotation-runbook.md` (452 lines) | Runbook exists with rotation procedures for JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY, and R2 credentials. Verified file present on `main`. |
| A99-6 | STILL OPEN | ✅ **FIXED** | `lib/logger.ts:37-56,74-75` | `LOG_SAMPLE_RATE` env var (0–1, default 1) implemented. `getLogSampleRate()` parses and clamps. `shouldSample()` always returns `true` for warn/error; probabilistically samples info/debug. Integrated at `emit()` level. |
| A99-3 | STILL OPEN | ✅ **FIXED** | `app/api/track/click/route.ts:64-78,105` | `trackKvDedupWrite()` tracks per-minute write count. Emits structured warning + `captureException` when writes exceed `KV_DEDUP_WRITE_ALERT_RATE` (default 500/min). Called after each KV dedup write. |

### PR #705 — atob/JSON.parse Safety + KV Error Capture + APP_URL Validation

| Finding ID | Prev Status | Wave 3 Status | Evidence (file:line) | Verification Notes |
| ---------- | ----------- | ------------- | -------------------- | ------------------ |
| A100-3 | STILL OPEN | ✅ **FIXED** | `app/api/auth/logout/route.ts:8,48-53` | `captureException` imported; `JSON.parse(atob(base64))` at :48 is inside try-catch with `captureException(e, { context: "..." })` at :53. Errors no longer silently swallowed. |
| A100-4 | STILL OPEN | ✅ **FIXED** | `app/api/auth/reset-password/route.ts:7,130-136` | `captureException` imported; `JSON.parse(atob(base64))` at :130 is inside try-catch with `captureException(e, { context: "..." })` at :136. |
| A100-8 | STILL OPEN | ✅ **FIXED** | `lib/signed-cookie.ts:10,55,76` | `captureException` imported; `atob(signedValue)` at :55 is inside try-catch with `captureException(e, { context: "..." })` at :76. |
| A100-14 | STILL OPEN | ✅ **FIXED** | `lib/hmac-key.ts:18,73,76` | `captureException` imported; pre-warm `.catch(() => {})` replaced with `.catch(e => captureException(e, { context: "..." }))` for both activity-cookie (:73) and signed-cookie (:76) pre-warm paths. |
| A100-25 | STILL OPEN | ✅ **FIXED** | `instrumentation.ts:114-138` | `APP_URL` validation at startup: parses hostname, compares against `allSites` domains and `WILDCARD_PARENT_DOMAINS`. Unknown hosts trigger `logger.error()`. Runs only in production (non-build). |

**Bonus fix (not in original findings):** `app/api/admin/users/me/password/route.ts:10,83-89` — same `JSON.parse(atob())` pattern now also has `captureException` in the catch block.

### PR #707 — Integration Tests + requestId Child Logger

| Finding ID | Prev Status | Wave 3 Status | Evidence (file:line) | Verification Notes |
| ---------- | ----------- | ------------- | -------------------- | ------------------ |
| A86-1 | STILL OPEN | ✅ **FIXED** | `__tests__/integration/login-flow.test.ts` (156 lines, 5 tests) | Login flow integration test exercising real `POST /api/auth/login` handler with mocked externals. Covers: TOTP 2FA challenge (202), TOTP verification + binding-cookie, HIBP breach-check advisory, account lockout (423), activity-cookie on success. |
| A86-2 | STILL OPEN | ✅ **FIXED** | `__tests__/api/stripe-webhook-e2e.test.ts` (136 lines, 5 tests) | Stripe webhook e2e test with properly HMAC-signed `checkout.session.completed` event. Covers: subscription activation, duplicate detection, missing/invalid signature (400), unconfigured secret (503). |
| A93-2 | STILL OPEN | ✅ **FIXED** | `app/api/auth/login/route.ts:235-236`, `app/api/auth/logout/route.ts:21-22`, `app/api/auth/me/route.ts:19-20` | All three auth routes now extract `x-trace-id` header and create `logger.child({ requestId })`. Every log line in a request carries the correlation ID. |

### PR #706 — compareai.site Domain Rename

| Change | Status | Evidence | Notes |
| ------ | ------ | -------- | ----- |
| Domain config | ✅ DONE | `config/sites/ai-compared.ts:6,69` | `domain: "compareai.site"`, `email: "contact@compareai.site"` |
| Seed script | ✅ DONE | `scripts/seed-ai-compared.ts` | Domain constant updated |
| Original migration | ✅ DONE | `supabase/migrations/00029_ai_drafts_and_affiliate_networks.sql` | INSERT domain updated |
| Forward migration | ✅ DONE | `supabase/migrations/2026052907_rename_aicompared_to_compareai.sql` | UPDATE existing DB rows |
| Down migration | ✅ DONE | `supabase/migrations/2026052907_rename_aicompared_to_compareai-down.sql` | Rollback migration included |
| Tests | ✅ DONE | `__tests__/api/newsletter-tracking-integration.test.ts` | Test URLs updated |
| Docs | ✅ DONE | 3 audit/doc files | Domain references updated |

### PR #703 — REG-1 Email Subject Locale Fix

| Finding ID | Prev Status | Wave 3 Status | Evidence (file:line) | Verification Notes |
| ---------- | ----------- | ------------- | -------------------- | ------------------ |
| REG-1 | Regression (Low) | ✅ **FIXED** | `app/api/newsletter/route.ts:281` | `t("newsletter.confirm_subject", siteLocale)` now correctly passes `siteLocale` parameter. All four `t()` calls in the newsletter route (:202, :227, :281) use `siteLocale`. AR subjects will now render correctly. |

---

## Regression Check — New Issues from Wave 3

| # | Severity | PR | Location | Description | Assessment |
| - | -------- | -- | -------- | ----------- | ---------- |
| W3-NEW-1 | Info | #704 | `lib/middleware-site-lookup.ts:22-25` | Circuit breaker is module-level `new CircuitBreaker(...)` (not via `getCircuitBreaker()`), so it does not share state with other circuit breakers in the registry. | **Acceptable** — middleware runs in Edge runtime, so per-module state is correct. The `getCircuitBreaker()` registry is for Node.js runtime routes sharing a singleton. |
| W3-NEW-2 | Info | #705 | `instrumentation.ts:128-133` | `APP_URL` validation is warning-only (`logger.error`), not a hard failure. A misconfigured `APP_URL` will log an error but the app still starts. | **Acceptable** — warning-only is the correct approach for this check. A hard failure could prevent recovery from a temporarily misconfigured deploy. |
| W3-NEW-3 | Low | #707 | `app/api/auth/login/route.ts:235` | `requestId` uses `crypto.randomUUID()` as fallback when `x-trace-id` is absent. This is correct but means logs before middleware (e.g., cold-start logs) won't have the trace ID. | **Acceptable** — cold-start logs use the root logger by design (no request context). |

**No security regressions detected.** All changes are additive (error reporting, circuit breakers, tests, log sampling). No auth, session, CSRF, RLS, or SSRF guards were modified.

---

## Still-Open Findings After Wave 3

The following findings remain open across all seasons. They were not targeted by Wave 3 and were already documented in previous re-audit reports.

### Season 4 — Still Open (non-Wave 3)

| Finding ID | Severity | Description | Status |
| ---------- | -------- | ----------- | ------ |
| A87-1 | Medium | `setTimeout(r, 20)` in AI quota integration test | STILL OPEN |
| A88-3 | Medium | Off-by-one boundary test not added for rate-limit count | STILL OPEN |
| A88-4 | Medium | TOTP tolerance boundary test uses relative offset, not exact boundary | STILL OPEN |
| A88-6 | Medium | No direct test for disposable domain rejection | STILL OPEN |
| A90-2 | Medium | `captchaOnLogin` flag at rollout 0% (product decision pending) | STILL OPEN |
| A91-2 | Medium | `stripe-event-processor.ts` catch blocks lack context wrapping | STILL OPEN |
| A94-5 | Medium | On-call runbook lacks concrete rotation config | STILL OPEN |
| A94-7 | Medium | Duplicate of A98-6 — **NOW FIXED** (runbook exists) | ✅ FIXED |
| A95-2 | Medium | No automated down-migration test in CI | STILL OPEN |
| A96-2 | Medium | TOCTOU in `authorizeResource()` not addressed | STILL OPEN |
| A100-21 | High | Middleware still a single 668-line function without per-concern error boundaries | STILL OPEN |
| A96-1 / A98-1 | High | KV race condition (accepted risk, DO is primary) | ACCEPTED RISK |
| A99-4 | High | Singleflight not verified for all three cached queries | STILL OPEN |
| A99-5 | High | No Resend decouple pattern | STILL OPEN |
| A99-7 | High | stale-while-revalidate configuration not verified | STILL OPEN |

### Season 5 — Still Open

| Finding ID | Severity | Description | Status |
| ---------- | -------- | ----------- | ------ |
| A101-09 | Low | Unicode confusable normalization not added | STILL OPEN |
| A105-02 | Medium | No automated hallucination detection; human-review SLA not formalized | STILL OPEN |
| A105-03 | Low | No confidence scoring | STILL OPEN |
| A108-07 | Low | No ML-based classifier added | STILL OPEN |
| A109-05 | Low | Human-readable AI disclosure component missing (machine-readable exists) | STILL OPEN |
| A111-01 | Low | No seed/temperature logging | STILL OPEN |
| A111-05 | Low | Prompt hash / provider request-id not stored | STILL OPEN |

### Season 3 — Still Open (unchanged from previous report)

| Finding ID | Severity | Description |
| ---------- | -------- | ----------- |
| S3-001 | Low | `drip_enrollments` missing from RoPA table |
| S3-002 | Info | `AffiliateClickRow` type drift |
| S3-003 | Low | `consent_log` retention not documented |
| S3-005 | Low | Data export omits `consent_log` records |
| S3-006 | Low | Restriction has no downstream processor checks |
| S3-009 | Low | No server-side `Sec-GPC` header check |
| S3-010 | Medium | SOC 2 CC6.2/CC6.3 provisioning checklists incomplete |
| S3-011 | Low | SOC 2 CC1.2/CC1.4 still "In progress" |
| S3-013 | Medium | ISO 27001 A.5.13 labelling still "Partial" |
| S3-014 | Low | ISO 27001 A.8.10 deletion verification missing |
| S3-015 | Low | ISO 27001 A.5.23 cloud service DPA review cadence |
| S3-016 | Medium | `image_alt` not validated as non-empty on save |
| S3-017 | Low | Still using `vanilla-cookieconsent` (upgrade not in scope) |
| S3-018 | Low | No conformance date or audit methodology on accessibility page |
| S3-020 | Medium | Cookie consent-proof logging clarity not improved |
| S3-023 | Medium | Privacy policy does not mention drip campaigns |
| S3-024 | Low | Sub-processor list missing from privacy policy |
| S3-025 | Low | Retention schedule summary missing from privacy policy |
| S3-026 | Low | Cloudflare DLS configuration evidence still missing |
| S3-028 | Low | AI system monitoring section lacks output quality metrics |
| S3-031 | Medium | No route-specific body size limit on newsletter |
| S3-032 | Low | Worst-case input coverage not extended |
| S3-033 | Low | No total input length guard before sanitize-html |
| S3-035 | Medium | Resend email send still has no timeout or retry |
| S3-036 | Low | Sitemap ping failure logging not added |
| S3-037 | Low | No stale-while-revalidate pattern |
| S3-041 | Medium | `KV_GRACE_MS` defaults to 60s; no per-route auth override |
| S3-043 | Low | No max-iterations guard in data-retention |
| S3-045 | Low | No inflight map cap in single-flight |
| S3-050 | Medium | Per-request Supabase client creation (no module-level cache) |
| S3-051 | Low | `docs/cost-controls.md` references non-existent file |
| S3-054 | Low | No per-route log-level override |
| S3-055 | Low | Redaction still shallow (one level deep) |
| S3-057 | Low | No batch checkpointing for price scraping |
| S3-061 | Low | Failed email sends not queued for retry |
| S3-062 | Medium | Alert destinations still not configured |
| S3-063 | Low | Click tracking / newsletter lack burn-rate alerts |
| S3-064 | Low | Alert bootstrapping documentation not added |

### Season 6e — Still Open (unchanged)

| Finding ID | Severity | Description |
| ---------- | -------- | ----------- |
| A152-04 | Low | No automated T&S alert for disputes |
| A153-01 | Medium | No device fingerprinting |
| A153-02 | Low | No IP risk scoring |
| A153-03 | Low | No catch-all domain detection |
| A153-06 | Low | No progressive delays in rate limiting |
| A153-07 | Low | Turnstile not enforced fail-closed in production |
| A154-06 | Medium | No suspicious-login email notifications |
| A155-01 | Medium | No explicit 3DS2 opt-in (Stripe SCA auto-applies) |
| A155-04 | Low | No `dispute_flags` table |
| A155-05 | Low | No Stripe Radar rules configured server-side |
| A156-03 | Medium | No perceptual hash matching for UGC images |
| A156-05 | Low | No moderation SLA documented |
| A156-06 | Low | No appeal mechanism for rejected UGC |
| A157-03 | Low | No behavioral bot detection |
| A157-04 | Low | No honeypot form fields |
| A158-05 | Low | No Stripe customer ID cross-reference |
| A159-03 | Low | No in-app "Report" button on UGC |
| A162-06 | Low | Audit log stores raw IP for 365 days |

### Season 1 & 2 — Still Open (unchanged)

| Finding ID | Severity | Description |
| ---------- | -------- | ----------- |
| A9-004 | Low | Use `~` pinning for `@supabase/supabase-js`, `stripe` |
| A10-004 | Low | KV rate-limit race (ensure DO binding) |
| A17-003 | Low | Partial index for `missingUrl` filter |
| A18-003 | Low | Cron publish batch non-transactional |
| A21-005 | Medium | Admin emails stored in plaintext |
| A22-002 | Low | No app-level backup beyond Supabase PITR |
| A27-004 | Low | No partial indexes for soft-delete patterns |
| A31-01 | Low | R2 buckets lack ownership tags |
| A31-04 | Low | No egress filtering on Workers |
| A34-08 | Low | Wrangler version mismatch (4.85.0 vs 4.93.1) |
| A37-03 | Low | R2 versioning not GA |
| A38-04 | Low | Secret rotation drill unverified |
| A40-05 | Low | No IaC-codified dashboards |
| A45-05 | Low | Kill-switch documentation missing |
| A46-06 | Low | No formal schema validation library (zod/joi) |
| A48-03 | Low | Product update body parsing needs audit |
| A52-04 | Low | No AV scanning on uploads |

### Previous New Issues — Status Update

| ID | Report | Severity | Wave 3 Status | Notes |
| -- | ------ | -------- | ------------- | ----- |
| NEW-1 | S4-S5 | Low | STILL OPEN | `RATE_LIMIT_MEMORY_MAX_ENTRIES` parseInt leniency. Not targeted. |
| NEW-2 | S4-S5 | Info | STILL OPEN | Absolute session caps documentation. Not targeted. |
| NEW-3 | S4-S5 | Low | STILL OPEN | Flag rolloutPercent misleading. Not targeted. |
| NI-001 | S3-S6e | Low | **IMPROVED** | Supabase circuit breaker scope was narrow (AI cron only). PR #704 added circuit breakers to `getAnonClient()` and `getPrivilegedSupabaseClient()`, significantly broadening coverage. Middleware also has its own breaker. |
| NI-002 | S3-S6e | Low | STILL OPEN | Self-service data export covers 4/7 tables. Not targeted. |
| NI-003 | S3-S6e | Low | ✅ **FIXED** | Newsletter email subject not localized — fixed by PR #703. |
| REG-1 | S1-S2 | Low | ✅ **FIXED** | Email subject missing `siteLocale` — fixed by PR #703. |
| REG-2 | S1-S2 | Info | STILL OPEN | Data-export route HMAC reliance on middleware. Not targeted. |

---

## Consolidated Fix Scorecard — Wave 3

| Finding ID | Original Severity | PR | Status |
| ---------- | ----------------- | -- | ------ |
| A98-16 | High | #704 | ✅ FIXED |
| A99-2 | High | #704 | ✅ FIXED |
| A98-6 | High | #704 | ✅ FIXED |
| A99-6 | High | #704 | ✅ FIXED |
| A99-3 | High | #704 | ✅ FIXED |
| A100-3 | High | #705 | ✅ FIXED |
| A100-4 | High | #705 | ✅ FIXED |
| A100-8 | High | #705 | ✅ FIXED |
| A100-14 | High | #705 | ✅ FIXED |
| A100-25 | High | #705 | ✅ FIXED |
| A86-1 | High | #707 | ✅ FIXED |
| A86-2 | High | #707 | ✅ FIXED |
| A93-2 | High | #707 | ✅ FIXED |
| REG-1 | Low (regression) | #703 | ✅ FIXED |
| NI-003 | Low (new issue) | #703 | ✅ FIXED |
| A94-7 | Medium | #704 | ✅ FIXED (duplicate of A98-6) |

**Wave 3 total: 15 findings FIXED (13 High + 1 Medium + 1 Low regression + 1 Low new issue)**

---

## Cumulative Fix Status Across All Waves

| Wave | PRs | Findings Fixed | Key Areas |
| ---- | --- | -------------- | --------- |
| Wave 1 (PRs #694–#698) | #694, #695, #696, #698 | 17 | LRU cap, session lifetime, GDPR export, CCPA, cookie consent, circuit breaker (AI cron), i18n, DRY refactors, captureException |
| Wave 2 (docs) | #700, #701, #702 | 0 | Re-audit verification reports only |
| Wave 3 (PRs #703–#707) | #703, #704, #705, #706, #707 | 15 | Circuit breakers (broad), atob/JSON.parse safety, KV monitoring, log sampling, secrets runbook, integration tests, requestId, domain rename, locale fix |

**Grand total: 32 findings addressed across all waves.**

---

## Severity Distribution of Remaining Open Findings

| Severity | Count | Notes |
| -------- | ----- | ----- |
| High | 4 | A99-4 (singleflight coverage), A99-5 (Resend decouple), A99-7 (s-w-r config), A100-21 (middleware monolith) |
| Medium | ~18 | Mix of compliance (SOC 2, ISO 27001), test gaps (A87-1, A88-3), and feature gaps (fingerprinting, hallucination detection) |
| Low | ~50 | Hardening recommendations, documentation gaps, minor test improvements |
| Info | ~5 | Type drift, documentation, observability suggestions |

---

## Key Outcomes

1. **All 13 HIGH findings targeted by Wave 3 are FIXED** and verified in code.
2. **REG-1 regression from Wave 1 is FIXED** by PR #703.
3. **NI-001 (narrow circuit breaker scope) is significantly IMPROVED** — circuit breakers now cover anon, privileged, and middleware Supabase paths.
4. **NI-003 (subject locale) is FIXED** by PR #703.
5. **No new security regressions** introduced by Wave 3 PRs. Three Info/Low observations noted (W3-NEW-1 through W3-NEW-3), all assessed as acceptable.
6. **Domain rename (PR #706)** is clean — config, seeds, migrations, tests, and docs all consistently reference `compareai.site`.
7. **4 High findings remain open** (A99-4, A99-5, A99-7, A100-21) — these are resilience/architecture improvements not targeted by Wave 3.
8. The codebase maintains a **mature security posture** with comprehensive defense-in-depth.

---

## Recommended Next Wave (Priority Order)

1. **A100-21** (HIGH): Decompose middleware into per-concern error boundary modules.
2. **A99-4** (HIGH): Verify singleflight coverage for all three cached queries.
3. **A99-5** (HIGH): Decouple Resend email sends (async queue pattern).
4. **A99-7** (HIGH): Configure and verify stale-while-revalidate for CDN caching.
5. **A105-02** (MEDIUM): Formalize human-review SLA as compensating control for hallucination risk.
6. **A21-005** (MEDIUM): Consider app-level encryption for admin emails.

---

_Final Re-Audit Verification — Wave 3 — Complete._

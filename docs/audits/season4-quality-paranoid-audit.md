# Season 4 — Code Quality & Paranoid Pass Audit

**Repository:** `groupsmix/affilite-mix`  
**Branch:** `main` (commit `ebe636a6`)  
**Date:** 2026-05-29  
**Auditor:** Devin (principal-engineer role)  
**Stack:** Next.js 15, Supabase, Cloudflare Workers, Vitest (196 test files), ESLint, TypeScript strict

---

## [A86] Coverage by Criticality

Per critical-path list: unit / integration / e2e / load / chaos / security test coverage. Gaps = findings.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A86-1 | High | Coverage | `app/api/auth/login/route.ts` | Login route is ~300 LOC with HIBP, TOTP, rate-limit, IP ban, and lockout logic. No dedicated integration test exercises the full happy-path with a real DB (integration suite is `skipIf` without DB). Only unit-level mocks. | Add integration test for login flow covering TOTP + HIBP + lockout + binding cookie. | OWASP Testing v4 §4.4 |
| A86-2 | High | Coverage | `app/api/membership/webhook/route.ts` | Stripe webhook route has contract tests but no e2e test that fires a real Stripe test event through the stack. Replay fuzz tests exist but mock the signature verification path. | Add e2e or integration test with Stripe CLI `trigger` against a test endpoint. | PCI-DSS §6.5.10 |
| A86-3 | Medium | Coverage | `app/api/cron/commission-ingest/route.ts` | Commission ingest cron has three network adapters (CJ, Admitad, PartnerStack). Zero test files found for this route. JSON.parse of external bodies is uncovered. | Add unit tests with mocked adapter responses and malformed JSON edge cases. | ISO 27001 A.14.2.8 |
| A86-4 | Medium | Coverage | `lib/stripe-event-processor.ts` | Vitest coverage threshold is only 38% statements / 32% branches. Five catch blocks with `err` parameter are untested. | Ratchet to ≥60% and add tests for each event-type branch. | Internal SLO |
| A86-5 | Medium | Coverage | `app/api/track/click/route.ts` | Click tracking is the money path. Load test exists (k6) but chaos tests do not cover KV failure during click dedup — only `chaos/kv-outage-mid-request.test.ts` covers the generic KV outage, not the click-specific fingerprint path. | Add chaos test: KV.get throws mid-dedup → verify redirect still works + analytics fails closed. | SRE §5.3 |
| A86-6 | Low | Coverage | `app/api/cron/data-retention/route.ts` | No dedicated test file found. GDPR data-retention cron is compliance-critical. | Add test proving retention windows are honored and audit log entries preserved. | GDPR Art. 5(1)(e) |
| A86-7 | Medium | Coverage | `e2e/` | 14 e2e specs exist but none cover the Stripe checkout → webhook → membership activation flow end-to-end. | Add Playwright e2e for membership purchase golden path. | Payment testing best practice |
| A86-8 | Low | Coverage | `lib/totp-encryption.ts` | Encryption/decryption tested for happy path but no test for key-rotation mid-session (decrypt with old key after re-encryption). | Add rotation scenario test. | NIST SP 800-57 |

---

## [A87] Test Smell Hunt

Flakiness, shared state, leakage, missing assertions, asserting implementation not behavior.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A87-1 | Medium | Test Smell | `__tests__/quotas/ai-quota-integration.test.ts:105` | Uses `setTimeout(r, 20)` — arbitrary timing in async test. Flaky under CI load. | Replace with deterministic state check or `vi.advanceTimersByTime()`. | Testing best practice |
| A87-2 | Medium | Test Smell | `__tests__/stripe-webhook-fuzz.test.ts:40-84` | Multiple tests use `Date.now()` for timestamps without `vi.useFakeTimers()`. Under slow CI, the 5-minute tolerance window can produce false negatives on the "stale timestamp" test. | Use `vi.setSystemTime()` for deterministic time control. | Vitest docs §Fake Timers |
| A87-3 | Low | Test Smell | `__tests__/contract/worker-api-contract.test.ts:47-162` | 9 tests in `describe("ClickQueueMessage")` assert schema shape but never assert behavior (e.g., what happens when the queue consumer receives an invalid message). | Add behavioral tests for consumer rejection paths. | Testing Pyramid |
| A87-4 | Low | Test Smell | `__tests__/wildcard-subdomain-rejection.test.ts:87-135` | Test creates `new Date().toISOString()` for `created_at`/`updated_at` — couples test to wall-clock. Non-deterministic in timezone-edge scenarios. | Use a fixed ISO string. | Deterministic testing |
| A87-5 | Medium | Test Smell | `__tests__/etap3-auth-bnd-iat.test.ts:99` | Future-skew test uses `Date.now() + 24h` without fake timers. If test runs right at midnight UTC, the "far future" value could cross a day boundary causing subtle assertion failures. | Pin with `vi.setSystemTime()`. | Testing best practice |
| A87-6 | Low | Test Smell | Multiple `__tests__/*.test.ts` | 20+ test files use `beforeEach` to set `process.env.*` but some do not restore originals in `afterEach` — risk of inter-test leakage in parallel mode. | Use Vitest `vi.stubEnv()` / `vi.unstubAllEnvs()` pattern. | Vitest isolation |
| A87-7 | Medium | Test Smell | `__tests__/integration/` | All 5 integration tests gate on `describe.skipIf(!shouldRunSupabaseIntegration)`. Without a CI job that sets the real DB URL, these never execute. Zero evidence of a CI matrix job that runs integration tests. | Add CI workflow job `test:integration` with a Supabase test project or local Supabase CLI. | CI/CD best practice |

---

## [A88] Mutation-Test Thought Experiment

5 mutations per critical function — caught by any test?

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A88-1 | High | Mutation | `lib/csrf.ts:timingSafeCompare()` | Mutation: change `result \|= lenA ^ lenB` → `result \|= 0`. The timing-safe compare would accept mismatched-length tokens. No test specifically asserts that different-length tokens are rejected via the fixed-iteration branch. | Add test: `expect(timingSafeCompare("short", "muchlongertoken")).toBe(false)`. | CWE-208 |
| A88-2 | High | Mutation | `lib/auth.ts:verifyToken()` | Mutation: remove `isTokenRevoked()` check. Existing tests mock `isTokenRevoked` to return false — no test verifies that a revoked token is actually rejected. | Add test: mock `isTokenRevoked → true`, assert 401. | OWASP Session Mgmt |
| A88-3 | Medium | Mutation | `lib/rate-limit.ts` | Mutation: change `>= maxRequests` → `> maxRequests` (off-by-one). This allows one extra request. The test file `rate-limit-lru-eviction.test.ts` tests eviction but not the exact boundary count. | Add boundary test: exactly `maxRequests` calls → allowed; `maxRequests + 1` → blocked. | CWE-799 |
| A88-4 | Medium | Mutation | `lib/stripe-webhook.ts` | Mutation: change `DEFAULT_TOLERANCE_SECONDS = 5 * 60` → `5 * 600`. The fuzz test uses `Date.now() - 301` but does not assert the exact tolerance boundary. A 50-minute tolerance would pass. | Assert that timestamp at exactly `5*60 + 1` seconds ago is rejected. | Stripe webhook security |
| A88-5 | Medium | Mutation | `lib/sanitize-html.ts` | Mutation: add `"script"` to `ALLOWED_TAGS`. Existing tests check that `<script>` is stripped, so this mutation IS caught. ✓ | N/A — well tested. | XSS prevention |
| A88-6 | Medium | Mutation | `lib/validate-email.ts` | Mutation: remove disposable-email check. No unit test in `validate-email.test.ts` directly tests that a known disposable domain (e.g., `mailinator.com`) is rejected — that logic lives in a separate `disposable-email.ts` module. | Add integration test: `isValidEmail("test@mailinator.com")` with disposable check wired in. | Anti-abuse |
| A88-7 | High | Mutation | `lib/cron-auth.ts` | Mutation: return `true` unconditionally from `verifyCronAuth()`. If the test only checks "returns 401 on missing header" but not "returns 401 on wrong secret", this mutation survives. | Verify test covers: correct secret → true, wrong secret → false, missing secret → false. | CWE-306 |

---

## [A89] TODO / FIXME / HACK / XXX / Temporary

Every TODO/FIXME/HACK/XXX/temporary = finding until proven otherwise.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A89-1 | Medium | Tech Debt | `app/api/auth/login/route.ts:243` | Comment: `// OPS: temporary kill switch via LOGIN_RATE_LIMIT_GLOBAL_DISABLED=true`. This env-var bypass has no expiry date, no feature-flag registry entry, and no audit logging when activated. | Register in `FLAG_REGISTRY` with an expiry date, or remove and use the existing `RATE_LIMIT_FORCE_CLOSED` mechanism. | A90 policy |
| A89-2 | Low | Tech Debt | `middleware.ts:419` | Comment: `// P1-1: Serve a branded temporary unavailable response`. The word "temporary" refers to the response content, not a code TODO — confirmed benign. | N/A — false positive. | — |
| A89-3 | Low | Tech Debt | `lib/feature-flags.ts:52` | Comment: `not temporary feature flags` — documentation, not a TODO. Benign. | N/A — false positive. | — |
| A89-4 | Info | Hygiene | `__tests__/audit5-p3.test.ts:292` | Comment: `// otherwise this is just a TODO list, not tracked tech debt.` — test assertion comment about audit methodology. Benign. | N/A — meta-commentary in test. | — |

---

## [A90] Feature Flags

Kill switches, removable, no permanent, access logged.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A90-1 | High | Feature Flags | `app/api/auth/login/route.ts:243` | `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` env var acts as a kill switch but is NOT in the `FLAG_REGISTRY`. No expiry, no owner, no blast-radius documentation, no access logging. | Add to FLAG_REGISTRY or convert to a proper env-var-based kill switch with audit logging. | Feature flag policy §4 |
| A90-2 | Medium | Feature Flags | `lib/feature-flags.ts` | `features.captchaOnLogin` flag has `rolloutPercent: 0` — it was registered but never activated. The expiresAt is 2026-11-25 (180 days). Verify intent: if this is abandoned, remove it before expiry. | Confirm with product team; if abandoned, remove from registry. | No-permanent-flags policy |
| A90-3 | Medium | Feature Flags | `lib/rate-limit.ts` | `RATE_LIMIT_FORCE_CLOSED` env var is documented in comments as an incident kill-switch but has no structured registry entry, no access logging, and no documented blast radius. | Document in `docs/feature-flags.md` or add structured kill-switch registry with audit trail. | Feature flag policy §2 |
| A90-4 | Low | Feature Flags | `lib/dal/feature-flags.ts` | DAL supports per-site feature flags in the DB. When a flag is toggled, `recordAuditEvent` is called in the route — access IS logged. ✓ | N/A — correctly implemented. | — |
| A90-5 | Medium | Feature Flags | `app/api/auth/login/route.ts` | `HIBP_CACHE_TTL_SECONDS` is configurable via env var but not documented in `.env.example` or the README env table. Operators may not know this tuning knob exists. | Add to `.env.example` with description. | Operational documentation |

---

## [A91] Error Philosophy

Values vs exceptions, wrapped with context, single taxonomy.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A91-1 | Medium | Error Handling | `lib/api-error.ts` | Strong: single `ApiErrorCode` enum taxonomy with 15 codes. All API routes use `apiError()` helper. `redactDetails()` strips stack traces from client responses. Well-designed. | N/A — good. | — |
| A91-2 | Medium | Error Handling | `lib/stripe-event-processor.ts:84-207` | Five catch blocks log errors but do not wrap with context beyond `err.message`. The original error type (network vs. parse vs. DB) is lost. | Wrap: `new ProcessorError("checkout.session.completed failed", { cause: err })`. | Error wrapping best practice |
| A91-3 | Low | Error Handling | `lib/r2.ts:573` | `.catch(() => undefined)` silently swallows R2 delete errors. If staging cleanup fails, orphaned objects accumulate in R2 with no alert. | Log at `warn` level with the key name so operators can investigate orphans. | Storage hygiene |
| A91-4 | Medium | Error Handling | `lib/hmac-key.ts:71-72` | Pre-warm `.catch(() => {})` — empty catch swallows key-derivation failures at startup. If JWT_SECRET is misconfigured, the first real request fails with a confusing error instead of a clear startup failure. | Log at `error` level in the catch so misconfiguration surfaces immediately in logs. | Fail-fast principle |
| A91-5 | Low | Error Handling | `app/api/admin/feature-flags/route.ts:30` | Catch block returns generic `"Failed to list feature flags"` 500 without the `ApiErrorCode`. Uses `NextResponse.json()` directly instead of `apiError()`. | Use `apiError(500, "Failed to list feature flags", undefined, undefined, "INTERNAL_ERROR")`. | Consistent error taxonomy |

---

## [A92] i18n

Every user string externalized, plurals, RTL, locale dates/numbers.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A92-1 | High | i18n | `app/api/newsletter/route.ts:50-59` | Confirmation email HTML contains hardcoded English strings: "Confirm your subscription", "Thanks for subscribing", "If you did not sign up". The `t()` function from `lib/i18n` is imported but only used for API error messages, not for the email body. Arabic sites receive English-only confirmation emails. | Use `t("newsletter.confirm_heading", locale)` etc. in `buildConfirmationEmail()`. | WCAG 3.1.1 |
| A92-2 | High | i18n | `app/api/newsletter/route.ts:224` | Plain-text email fallback: `"Thanks for subscribing to ${safeTextSiteName}!"` — hardcoded English. | Use locale catalog for the text email too. | i18n best practice |
| A92-3 | Medium | i18n | `components/admin/tenant-badge-switcher.tsx:89-94` | Admin UI strings hardcoded: `"All sites"`, `"No site selected"`, `"Failed to load sites"`. Admin panel has no i18n infrastructure at all. | Acceptable for English-only admin panel — document decision in ADR. If admin i18n is planned, externalize. | ADR-0004 |
| A92-4 | Medium | i18n | `app/admin/(dashboard)/components/dashboard/*.tsx` | Multiple dashboard components use `toLocaleString("en-US", ...)` — hardcoded to US locale regardless of the active site's language. | Derive locale from active site: `toLocaleString(site.locale, ...)`. | CLDR compliance |
| A92-5 | Medium | i18n | `app/(public)/components/price-history-chart.tsx:19` | `new Intl.NumberFormat("en-US", { style: "currency", currency })` — hardcoded US formatting for currency. An Arabic site showing prices in USD still gets LTR number formatting. | Use site locale for `Intl.NumberFormat`. | RTL support |
| A92-6 | Low | i18n | `lib/i18n/index.ts` | Only 2 locales (en, ar) with ~20 keys each. No pluralization support (e.g., `{count} items`). No ICU MessageFormat. | Adequate for current scope. If adding more locales or plural forms, adopt `intl-messageformat`. | ICU MessageFormat |
| A92-7 | Low | i18n | `app/layout.tsx:122` | `dir={site.direction ?? "ltr"}` — RTL is set at root level. Good. But `app/(public)/components/cinematic-ui.tsx:123` uses `toLocaleString("en-US")` inside an RTL context — the number direction will be LTR-embedded in RTL text without `unicode-bidi` isolation. | Wrap formatted numbers in `<bdi>` tags for proper BiDi embedding. | Unicode BiDi Algorithm |

---

## [A93] Logging Quality

Structured JSON, correlation IDs, levels correct, sampling.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A93-1 | Low | Logging | `lib/logger.ts` | Strong: structured JSON output, PII deny-list with 30+ fields, pattern-based redaction, IP truncation, value-level email redaction. Correlation ID via `logger.child({ requestId })`. Well-implemented. | N/A — good. | — |
| A93-2 | High | Logging | `app/api/` (all routes) | Zero API routes call `logger.child({ requestId })`. The trace ID is generated in middleware and set as a header, but no route extracts it and creates a child logger. Log correlation exists in theory but not in practice. | Add `const log = logger.child({ requestId: request.headers.get("x-trace-id") })` to route entry points. | Observability best practice |
| A93-3 | Medium | Logging | `app/web-vitals.tsx:15` | Uses `console.log` for Web Vitals instead of the structured logger. In production, this produces unstructured text mixed with JSON lines. | Use logger or send to `/api/vitals` endpoint (which already exists). | Log uniformity |
| A93-4 | Low | Logging | `lib/report-error.ts:16` | `console.error("[error-boundary]", ...)` — unstructured. Should go through logger. | Use `logger.error()` instead. | Log uniformity |
| A93-5 | Medium | Logging | `lib/logger.ts` | No log sampling configuration. In high-traffic production (100x Black Friday), debug/info logs from every request will overwhelm log storage. | Add sampling: `LOG_SAMPLE_RATE` env var for info-level logs in production. | Cost control |
| A93-6 | Low | Logging | `lib/env-bool.ts:54,80` | Uses `console.warn` directly — documented as intentional (avoid import cycle). Acceptable but loses structured format. | Consider lazy import of logger to get structured output. | Minor |

---

## [A94] Docs

README accurate, runbook, architecture diagram, ADRs, on-call playbook.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A94-1 | Low | Docs | `README.md` | Comprehensive: setup instructions, env var table, project structure, multi-site testing guide. Accurate for current state. | N/A — good. | — |
| A94-2 | Low | Docs | `docs/DR-RUNBOOK.md` | Disaster recovery runbook exists with PITR, regional failover, and DNS procedures. Good. | N/A — good. | — |
| A94-3 | Low | Docs | `docs/architecture-diagram.md` | ASCII architecture diagram covers full stack: Cloudflare edge → Workers → Supabase → KV/DO/R2. Accurate. | N/A — good. | — |
| A94-4 | Low | Docs | `docs/adr/` | 13 ADRs covering key decisions (Cloudflare Workers, bcrypt migration, DO rate limiter, no-i18n-library, CSP nonces). Good coverage. | N/A — good. | — |
| A94-5 | Medium | Docs | `docs/alerting-runbook.md` | On-call playbook references Sentry and Cloudflare Analytics but does not specify an on-call rotation tool (PagerDuty, Opsgenie, etc.) or escalation contacts. The "who gets paged" section is abstract. | Add concrete on-call rotation config and escalation contacts. | SRE §14 |
| A94-6 | Low | Docs | `.env.example` | Missing `HIBP_CACHE_TTL_SECONDS`, `LOGIN_RATE_LIMIT_GLOBAL_DISABLED`, `INTERNAL_HMAC_MIGRATION_MODE`, `INTERNAL_HMAC_MIGRATION_DEADLINE` env vars that are referenced in code. | Add all operationally-relevant env vars to `.env.example`. | Operational completeness |
| A94-7 | Medium | Docs | `docs/` | No runbook for "how to rotate JWT_SECRET" — the most critical secret. `docs/secrets-rotation-runbook.md` is referenced in `access-recertification.md` but the file is not present in the docs directory. | Create `docs/secrets-rotation-runbook.md` with step-by-step JWT_SECRET, CRON_SECRET, STRIPE_WEBHOOK_SECRET rotation procedures. | SOC2 CC6.1 |

---

## [A95] Scope Minimal

No drive-by refactors, migration path, rollback plan.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A95-1 | Low | Scope | Recent commits | Last 10 commits are well-scoped: each addresses a specific audit finding (S11-001 through S11-009, CodeQL cleanups). No drive-by refactors observed. | N/A — good discipline. | — |
| A95-2 | Medium | Scope | `supabase/migrations/` | Migrations include paired `-down.sql` files for destructive changes. Good rollback practice. However, no automated rollback test exists — the `deploy-order-security-migrations.md` doc describes the process but CI doesn't validate down migrations. | Add CI step: apply migration → apply down migration → verify schema returns to prior state. | Migration safety |
| A95-3 | Low | Scope | `lib/read-after-write.ts` | Forward-looking module for read-after-write consistency. Currently returns "primary" always (single-DB). Well-documented as future hook. Not premature — documents intent. | N/A — acceptable forward-looking code with clear comments. | — |

---

## [A96] Five Most-Likely-Skipped Bug Classes

Re-read and list 5 most likely bug classes you'd skip — then look specifically.

### 1. Race conditions in KV-based rate limiting

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A96-1 | High | Race Condition | `lib/rate-limit.ts` | KV-based rate limiter uses read-then-write (get → increment → put). Two concurrent requests can read the same counter value and both write `count+1`, allowing 2x the limit in a burst. The Durable Object path is atomic, but the KV fallback is not. | Document as accepted risk (KV is eventually-consistent by design) and ensure DO is the primary path in production. Add monitoring for KV-only windows. | CWE-362 |

### 2. TOCTOU in tenant authorization

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A96-2 | Medium | TOCTOU | `lib/authz.ts:authorizeResource()` | `authorizeResource` fetches the resource row to read its `site_id`, then checks permission against that site. If the resource is reassigned to a different site between the fetch and the permission check, the authorization decision is stale. Window is small but exists. | Use `SELECT ... FOR UPDATE` or check site_id in the mutation WHERE clause itself. | CWE-367 |

### 3. Integer overflow / precision loss in financial calculations

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A96-3 | Medium | Precision | `app/admin/(dashboard)/components/dashboard/revenue-per-site-card.tsx:10` | `formatUSD` uses `toLocaleString("en-US", { style: "currency" })` on a JS `number`. For large revenue values (>2^53 cents), floating-point precision loss can produce incorrect amounts. | Ensure revenue values from DB are stored as integer cents and converted only at display time. Verify DB column type is `bigint` or `numeric`. | IEEE 754 |

### 4. Unchecked JSON.parse on external input

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A96-4 | Medium | Input Validation | `app/api/cron/commission-ingest/route.ts:226,261,296` | Three `JSON.parse(rawBody)` calls on external API responses with no try-catch. If an affiliate network returns HTML (error page) instead of JSON, the cron crashes with an unhandled exception. | Wrap each `JSON.parse` in try-catch with structured error logging. | CWE-20 |

### 5. Cookie fixation via pre-existing cookies

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A96-5 | Low | Session | `lib/auth.ts` | Uses `__Host-` cookie prefix in production which prevents domain/path attribute injection. This mitigates cookie fixation. ✓ However, in development (`IS_SECURE_COOKIE=false`), no `__Host-` prefix is used, so dev environments are vulnerable to cookie fixation from a sibling localhost service. | Document as accepted dev-only risk. Consider adding `SameSite=Strict` in dev mode. | CWE-384 |

---

## [A97] HN Frontpage CVE — Advisory

Write advisory (CVSS, root cause, PoC, mitigation), then verify.

### CVE Advisory: KV Rate-Limit Race Condition Allows Burst Bypass

**CVSS 3.1:** 5.3 (Medium) — `AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L`

**Affected Component:** `lib/rate-limit.ts` — KV-backed distributed rate limiter

**Root Cause:** The KV-based rate limiter performs a non-atomic read-modify-write cycle: `KV.get(key)` → parse count → increment → `KV.put(key, newCount)`. Cloudflare KV is eventually consistent with last-writer-wins semantics. When multiple Workers isolates handle concurrent requests for the same rate-limit key, each reads the same stale counter and writes `count+1`, effectively allowing `N × maxRequests` through in a burst window where `N` is the number of concurrent isolates.

**PoC (conceptual):**
```
# Send 100 concurrent requests from different IPs to the same endpoint
# with a rate limit of 10/minute. Under KV-only mode (DO unavailable),
# all 100 may succeed because each isolate reads count=0.
for i in $(seq 1 100); do
  curl -s https://target/api/newsletter -d '{"email":"test@test.com"}' &
done
wait
```

**Blast Radius:** Newsletter spam, login brute-force amplification (mitigated by bcrypt cost + account lockout), click-tracking abuse.

**Mitigation (already in place):**
1. Durable Objects are the primary rate limiter in production — KV is the fallback.
2. Per-IP + per-email + global rate limits create defense-in-depth.
3. Turnstile CAPTCHA on newsletter and login routes adds bot protection.
4. Account lockout after N failed attempts prevents brute-force regardless of rate-limit bypass.

**Verification:** The codebase correctly prioritizes Durable Objects (`RATE_LIMITER_DO` binding) over KV. The `rate-limit-do.test.ts` confirms DO-first behavior. The KV path is fallback-only with a documented grace window. The combined defense-in-depth mitigations reduce the practical exploitability significantly.

**Recommendation:** Monitor DO availability and alert if DO is unavailable for >60s (forces KV-only mode). Consider adding a `RATE_LIMIT_DO_REQUIRED=true` env var that fails closed if DO is unavailable.

---

## [A98] Four Reviewers — Each ≥5 Findings

### Reviewer 1: Kernel Hacker

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A98-1 | High | Concurrency | `lib/rate-limit.ts` | KV read-modify-write race (see A96-1/A97). Non-atomic counter update under concurrent load. | Use DO as primary; monitor KV-only windows. | CWE-362 |
| A98-2 | Medium | Memory | `lib/rate-limit.ts` (in-memory fallback) | In-memory LRU rate-limit store has a configurable cap but defaults to 10,000 entries. On a Worker isolate with 128MB memory, 10K entries with string keys + metadata could consume ~5MB. Under attack, unique IPs fill the LRU and evict legitimate entries, creating a "rate-limit amnesia" DoS vector. | Lower default cap or use a probabilistic data structure (Count-Min Sketch). | Memory management |
| A98-3 | Medium | Resource Leak | `lib/fetch-timeout.ts` | Retry logic creates new `AbortController` per attempt but does not abort the previous controller if the response was partially received. A slow-drip response could hold open the previous connection while the retry starts a new one. | Abort the previous controller before retrying. | CWE-404 |
| A98-4 | Low | Signal Handling | `middleware.ts:36-40` | `throwIfAborted(signal)` checks `signal?.aborted` but the middleware itself does not pass `AbortSignal` from the request. The function exists but is not wired to the request's abort signal. | Pass `request.signal` to `throwIfAborted()` calls. | Request lifecycle |
| A98-5 | Medium | Atomicity | `lib/click-queue.ts` | Click queue publish is fire-and-forget via `runAfterResponse()`. If the isolate is terminated (CPU limit) before the async publish completes, the click is silently lost with no DLQ entry. | Add a `waitUntil()` wrapper that ensures the Cloudflare runtime keeps the isolate alive until the queue write completes. | Durability |

### Reviewer 2: SOC2 Auditor

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A98-6 | High | Compliance | `docs/` | `secrets-rotation-runbook.md` is referenced but does not exist. SOC2 CC6.1 requires documented key-rotation procedures. | Create the missing runbook. | SOC2 CC6.1 |
| A98-7 | Medium | Compliance | `app/api/auth/login/route.ts:243` | `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` bypass has no audit trail. If an operator disables rate limiting, no audit event is recorded. | Log an audit event when this env var is detected as `true` at startup. | SOC2 CC7.2 |
| A98-8 | Medium | Compliance | `lib/auth.ts` | Admin sessions have a 30-minute idle timeout but no absolute session lifetime cap. An admin who keeps clicking can maintain a session indefinitely. SOC2 expects absolute session limits. | Add `MAX_SESSION_LIFETIME_MS` (e.g., 8 hours) independent of idle timeout. | SOC2 CC6.1 |
| A98-9 | Medium | Compliance | `docs/access-recertification.md` | References quarterly access reviews but no evidence of automated access review enforcement. The `cron/access-review` endpoint exists but its output is not integrated with any SIEM or ticketing system. | Document the access-review output integration or build it. | SOC2 CC6.2 |
| A98-10 | Low | Compliance | `app/api/admin/privacy/user/route.ts` | GDPR RTBF endpoint deletes data but does not generate a deletion certificate or confirmation email to the data subject. | Emit a structured audit event with deletion manifest and optionally notify the subject. | GDPR Art. 17(1) |

### Reviewer 3: Privacy Lawyer

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A98-11 | Medium | Privacy | `app/api/track/click/route.ts` | Click fingerprint uses `HMAC(siteId + contentSlug + ipPrefix + uaHash)`. While the IP is truncated to /24, the combination with UA hash may still be considered a pseudonymous identifier under GDPR. No privacy notice mentions click fingerprinting. | Add click-fingerprinting disclosure to privacy policy. Ensure the fingerprint TTL (24h) is documented in data-retention policy. | GDPR Art. 13(1)(c) |
| A98-12 | Medium | Privacy | `lib/logger.ts` | Logger redacts emails but truncates IPs to /24 (first 3 octets). Under GDPR, truncated IPs are still personal data if they can identify a household (small subnets). | Consider /16 truncation for EU traffic or hash the IP entirely. | GDPR Recital 30 |
| A98-13 | Low | Privacy | `app/api/consent/log/route.ts` | Consent log records user consent choices. Good. But no test verifies that consent withdrawal actually stops downstream processing (newsletter sends, tracking). | Add integration test: withdraw consent → verify newsletter sends are blocked. | GDPR Art. 7(3) |
| A98-14 | Medium | Privacy | `app/api/cron/data-retention/route.ts` | Data retention cron exists but has no test coverage (A86-6). If the cron silently fails, PII is retained beyond policy. | Add monitoring + dead-man's-switch for the retention cron. | GDPR Art. 5(1)(e) |
| A98-15 | Low | Privacy | `lib/i18n/index.ts` | Arabic locale catalog exists but GDPR notice strings are not localized. Arabic users may not understand their data rights if presented in English. | Add GDPR notice strings to Arabic catalog. | GDPR Art. 12(1) |

### Reviewer 4: Chaos SRE

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A98-16 | High | Resilience | `lib/supabase-server.ts` | `getTenantClient()` creates a Supabase client per request. If Supabase is unreachable, every request creates a new failing client with no circuit breaker. Under sustained DB outage, Workers burn CPU on repeated TLS handshakes. | Add circuit breaker for Supabase client creation (similar to AI circuit breaker). | SRE §5.3 |
| A98-17 | Medium | Resilience | `middleware.ts` | Middleware performs up to 3 KV lookups (unknown-host cache, rate-limit, site resolution) sequentially. If KV latency spikes to 500ms per call, middleware adds 1.5s to every request. | Parallelize independent KV lookups with `Promise.all()`. | Latency budget |
| A98-18 | Medium | Resilience | `app/api/cron/publish/route.ts` | Cron refuses to publish if `db_now()` RPC returns null. Correct fail-safe, but if the RPC function is dropped during a migration, ALL scheduled publishing stops silently (no alert). | Add cron-liveness monitoring that alerts if publish cron reports zero activity for >1 hour. | Dead-man's switch |
| A98-19 | Medium | Resilience | `lib/ai/circuit-breaker.ts` | Circuit breaker recovery timeout is 30s. After recovery, the breaker enters HALF_OPEN and allows ONE probe request. If that probe happens to be a large content generation request that takes 10s, the circuit stays in HALF_OPEN blocking other requests for 10s. | Allow N probe requests in HALF_OPEN (e.g., 3) to reduce recovery time. | Circuit breaker pattern |
| A98-20 | Low | Resilience | `lib/click-queue.ts` | Click queue DLQ is DB-backed. If the DB is down during a click queue failure, the DLQ write also fails, creating a double-failure scenario where clicks are permanently lost. | Add a local file/KV fallback DLQ for the DB-backed DLQ. | Defense-in-depth |

---

## [A99] 3am Black Friday 100x Traffic + AZ Down + Partial Cache

Per changed line recently: what fails at 3am Black Friday with 100x traffic + AZ down + partial cache.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A99-1 | Critical | Scalability | `lib/rate-limit.ts` | At 100x traffic, the in-memory LRU (10K entries) fills in seconds. Every new IP evicts an old entry, effectively disabling rate limiting for returning IPs. The evicted IP's counter resets to 0 on next visit. | Increase LRU cap dynamically based on available memory, or switch to a probabilistic counter (Count-Min Sketch) that doesn't evict. | CWE-799 |
| A99-2 | High | Scalability | `middleware.ts` | At 100x traffic with AZ down, Supabase connection pool exhaustion is likely. The middleware calls `getMiddlewareSiteRowByDomain()` which hits the DB for unknown domains. The negative-cache TTL helps but new attack domains bypass it. | Add a circuit breaker on site-resolution DB calls. After N failures, serve a static maintenance page. | SRE §5.3 |
| A99-3 | High | Resilience | `app/api/track/click/route.ts` | At 100x traffic, KV dedup writes could hit KV's 1000 writes/s limit. Beyond that, writes are silently dropped, causing duplicate click records and inflated affiliate revenue reports. | Add KV write-rate monitoring; degrade gracefully by allowing duplicates when KV is saturated (analytics fail-open, redirect still works). | Revenue integrity |
| A99-4 | Medium | Cache | `lib/dal/sites.ts:42,89,113` | Site lookups use `next/cache` with `revalidate: 60`. At 100x traffic, a cache miss triggers 100x concurrent revalidation requests to Supabase (thundering herd). | Use `singleflight` (already implemented for site lookups) to coalesce concurrent revalidation. Verify singleflight is wired for all three cached queries. | Cache stampede prevention |
| A99-5 | Medium | Resilience | `app/api/newsletter/route.ts:74` | Newsletter endpoint calls `process.env.RESEND_API_KEY` — if Resend is down at 3am, newsletter signups return 500 instead of accepting the subscription and deferring email delivery. | Decouple: accept the subscription (DB write), enqueue confirmation email. If email send fails, retry via cron. | Eventual consistency |
| A99-6 | High | Resource | `lib/logger.ts` | At 100x traffic without log sampling, every request emits multiple structured JSON log lines. On Cloudflare Workers with Logpush, this could generate TB/day of log data, causing cost spikes and potential Logpush backpressure. | Implement probabilistic sampling for info-level logs in production. Keep error/warn at 100%. | Cost control |
| A99-7 | Medium | Partial Cache | `app/(public)/[contentType]/[slug]/page.tsx` | ISR pages with `revalidate` tags. If the CDN cache is partially invalidated (AZ down), cold pages hit the origin. At 100x traffic, origin CPU could spike. | Ensure `stale-while-revalidate` is configured in Cloudflare cache rules to serve stale content during origin overload. | CDN resilience |

---

## [A100] Final Paranoid Pass

Per function/resource — what it does, worst input, worst env, worst attacker, regret-in-6-months. ≥25 findings.

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A100-1 | Critical | Security | `app/api/auth/login/route.ts` | Worst attacker: Distributed brute force with 10K IPs. Each IP gets `maxRequests` attempts before rate limit. With KV race condition (A97), effective limit is higher. Combined with no absolute session lifetime (A98-8), a compromised credential has unlimited session duration. | Layer: IP rate limit + email rate limit + global rate limit + account lockout + CAPTCHA + absolute session lifetime. All exist except absolute session lifetime. | Defense-in-depth |
| A100-2 | High | Security | `lib/csrf.ts` | Worst input: a CSRF token that is an empty string `""`. `timingSafeCompare("", "")` returns `true` — both arrays are empty, the XOR accumulator stays 0. If a bug causes both cookie and header to be empty strings, CSRF is bypassed. | Add explicit `if (!a \|\| !b) return false` guard at the top of `timingSafeCompare`. The current code has `if (bufA.byteLength === 0 \|\| bufB.byteLength === 0) return false` which correctly handles this — verified. ✓ | CWE-352 |
| A100-3 | High | Security | `app/api/auth/logout/route.ts:41` | `JSON.parse(atob(base64))` — decodes JWT payload without verification to extract `sub` for audit logging. If a crafted JWT has a malicious payload (e.g., `__proto__` poisoning via `JSON.parse`), this could affect the audit log. | Use `jose.decodeJwt()` which is prototype-pollution-safe, or add `JSON.parse` with a reviver that rejects `__proto__`. | CWE-1321 |
| A100-4 | High | Security | `app/api/auth/reset-password/route.ts:130` | Same `JSON.parse(atob(base64))` pattern as A100-3. Extracts email from JWT payload for logging without verifying the JWT first. | Verify JWT before extracting claims, or use `jose.decodeJwt()`. | CWE-1321 |
| A100-5 | Medium | Reliability | `app/api/membership/checkout/route.ts:50` | `JSON.parse(raw)` for `STRIPE_PRICE_MAP` env var. If the env var contains malformed JSON, the route throws an unhandled exception on every request. No startup validation. | Validate `STRIPE_PRICE_MAP` at startup with a schema check; fail fast with a clear error. | Fail-fast |
| A100-6 | Medium | Security | `app/api/csp-report/route.ts:61` | `JSON.parse(raw)` on CSP violation reports from browsers. A crafted CSP report with deeply nested objects could cause CPU spike during parsing. The 10KB size cap helps but nested JSON amplification within 10KB can still be expensive. | Add `JSON.parse` depth limit or use a streaming parser with depth cap. | CWE-400 |
| A100-7 | Medium | Data Integrity | `lib/dal/cursor-pagination.ts:80` | `JSON.parse(raw)` deserializes opaque cursor from client. If cursor is tampered, it could inject unexpected filter values. The `ALLOWED_ORDER_COLUMNS` set mitigates column injection, but the cursor payload's `value` field is not type-checked after deserialization. | Add Zod/runtime schema validation on the deserialized cursor payload. | CWE-502 |
| A100-8 | High | Security | `lib/signed-cookie.ts:54` | `atob(signedValue)` — if `signedValue` is not valid base64, `atob()` throws. The error could bubble up as a 500. | Wrap in try-catch and return `null` on invalid base64 (treat as unsigned/tampered). | CWE-20 |
| A100-9 | Medium | Operational | `app/api/health/route.ts` | Health endpoint checks 7 dependencies (DB, KV, DO, APP_CACHE_KV, click queue, Resend, env vars). All checks are sequential — worst case 7 × timeout = 35s response time. | Parallelize health checks with `Promise.allSettled()` and a global timeout. | Health check best practice |
| A100-10 | Medium | Security | `lib/affiliate-domain-allowlist.ts` | Domain allowlist has a hardcoded fallback list. If the DB-sourced allowlist fails to load, the fallback is used. An attacker who can make the DB call fail can force the system onto the smaller fallback list, which may not include their target redirect domain — but the fallback might also include overly broad domains. | Audit the hardcoded fallback list for overly permissive entries. | CWE-601 |
| A100-11 | Medium | Privacy | `app/api/track/impression/route.ts` | Impression tracking logs IP prefix + User-Agent hash. Combined with timestamp, this is a pseudonymous identifier. No consent check before recording impressions. | Gate impression tracking on cookie consent status. | ePrivacy Directive Art. 5(3) |
| A100-12 | Low | Reliability | `lib/sitemap-ping.ts:11-12` | Pings Google and Bing sitemap endpoints. Google deprecated sitemap ping in 2023. The ping will silently 404 with no error handling. | Remove Google sitemap ping (deprecated). Keep Bing if desired. | Google Search Central |
| A100-13 | Medium | Security | `app/api/queue/clicks/route.ts:182-186` | `INTERNAL_HMAC_MIGRATION_MODE` env var controls HMAC migration with a deadline. If the deadline passes and the migration is not completed, the behavior depends on `rawMode` — undocumented what happens if both old and new HMAC coexist past deadline. | Document the post-deadline behavior. Add a startup check that logs a warning if the deadline has passed. | Migration safety |
| A100-14 | High | Reliability | `lib/runtime-env.ts:111` | `.catch(() => {})` silently swallows KV pre-warm errors. If KV binding is misconfigured, all subsequent KV operations fail with confusing errors instead of a clear startup diagnostic. | Log at `warn` level: `"KV pre-warm failed — binding may be misconfigured"`. | Fail-fast |
| A100-15 | Medium | Security | `app/api/community/wrist-shots/route.ts` | Wrist-shot uploads accept `image_url` — recently patched (S11-001) with domain allowlist. Verify the allowlist includes only the R2 public URL and no user-controlled domains. | Audit `image-host-allowlist.ts` entries are all operator-controlled domains. | SSRF prevention |
| A100-16 | Low | Performance | `lib/dal/dal-client.ts` | DAL client getter is called per-query. If `getTenantClient()` is expensive (JWT signing), this adds latency per DAL call. | Cache the tenant client per-request (use request-scoped store or context). | Performance |
| A100-17 | Medium | Security | `lib/csp.ts:37` | CSP nonce generated with `crypto.getRandomValues()` + `btoa()` — correct. But the nonce is passed via a custom header (`x-nonce`) which is accessible to any code running in the same Worker isolate. If a third-party middleware or dependency reads headers, it could extract the nonce. | Keep nonce in a non-enumerable property or use a WeakMap keyed on the request object. | CSP Level 3 |
| A100-18 | Medium | Reliability | `app/api/cron/commission-ingest/route.ts` | Three network adapters run via `Promise.allSettled()` — one adapter failure doesn't block others. Good. But all three share the same Worker execution (30s CPU limit). If one adapter hangs for 25s, the others may not complete. | Add per-adapter timeout (10s each) to ensure all three fit within the 30s CPU budget. | Worker CPU limits |
| A100-19 | Low | Maintainability | `lib/stripe-event-processor.ts:30-48` | `getInvoiceSubscriptionId()` and `getChargeInvoiceId()` use `as unknown as` type casts to handle Stripe API version differences. If the Stripe SDK is updated, these casts may silently produce `undefined`. | Pin Stripe SDK version in `package.json` (already `^22.2.0`). Add a contract test that verifies the actual shape of `Invoice.subscription`. | Type safety |
| A100-20 | Medium | Security | `app/api/admin/users/me/password/route.ts:83` | Same `JSON.parse(atob(base64))` pattern as A100-3/A100-4. Third instance of unverified JWT payload extraction. | Centralize into a safe `decodeJwtPayloadForLogging()` utility that uses `jose.decodeJwt()`. | DRY + CWE-1321 |
| A100-21 | High | Availability | `middleware.ts` | Middleware is a single 668-line function. Any unhandled exception crashes the entire request pipeline. The try-catch at the top level returns a 500, but Cloudflare Workers may still log the isolate as unhealthy. At 100x traffic, a new bug in middleware = 100% outage. | Extract middleware into composable modules (already started with `withMaintenance`). Continue modularization so each concern has its own error boundary. | Single point of failure |
| A100-22 | Medium | Data Integrity | `app/api/cron/expire-deals/route.ts` | No test coverage found. If the deal-expiry logic has a timezone bug (comparing UTC timestamps with local timestamps), deals could expire early or never expire. | Add test with timezone edge cases (midnight UTC, DST transitions). | Temporal correctness |
| A100-23 | Medium | Security | `lib/totp-encryption.ts:115,154` | Uses `btoa(String.fromCharCode(...combined))` for binary→base64 encoding. This is correct for ASCII-range bytes but `String.fromCharCode` can produce unexpected results for byte values > 127 in some JS engines. | Use `Buffer.from(combined).toString("base64")` or a Web API-compatible `uint8ToBase64` utility. | Encoding correctness |
| A100-24 | Low | Observability | `lib/tracing.ts` | OpenTelemetry-compatible trace context parsing exists but no actual trace export configuration (no OTLP endpoint, no Jaeger/Zipkin). Traces are generated but go nowhere. | Configure OTLP export to Cloudflare's tracing or a self-hosted backend. | Distributed tracing |
| A100-25 | High | Security | `app/api/membership/checkout/route.ts:148-150` | `APP_URL` env var is used to construct Stripe success/cancel URLs. If `APP_URL` is misconfigured (e.g., attacker-controlled domain in a staging env), Stripe will redirect users to the attacker's domain after payment. | Validate `APP_URL` against known production domains at startup. Reject URLs not in the site domain registry. | CWE-601 |
| A100-26 | Medium | Reliability | `app/sitemap.ts:69` | `JSON.parse(raw)` on cached sitemap data from KV. If KV returns corrupted data (partial write due to outage), this throws and the sitemap returns 500. Search engines crawling during the outage get no sitemap. | Wrap in try-catch; on parse failure, regenerate sitemap from DB. | SEO resilience |
| A100-27 | Medium | Security | `lib/cookie-utils.ts:35` | `decodeURIComponent(match.split("=")[1])` — if the cookie value contains additional `=` characters (valid in base64), only the part before the first `=` is decoded. | Use `match.split("=").slice(1).join("=")` to handle values with `=`. | Cookie parsing correctness |
| A100-28 | Low | Maintainability | `app/api/admin/privacy/rectify/route.ts:44` | Hardcoded error string about `GDPR_HASH_SECRET` fallback — duplicate of the same string in `privacy/user/route.ts:308`. | Extract to a shared constant. | DRY |

---

## Summary

| Audit | Findings | Critical | High | Medium | Low | Info |
|-------|----------|----------|------|--------|-----|------|
| A86 — Coverage | 8 | 0 | 2 | 5 | 1 | 0 |
| A87 — Test Smells | 7 | 0 | 0 | 4 | 3 | 0 |
| A88 — Mutation Experiment | 7 | 0 | 3 | 4 | 0 | 0 |
| A89 — TODO/FIXME/HACK | 4 | 0 | 0 | 1 | 2 | 1 |
| A90 — Feature Flags | 5 | 0 | 1 | 3 | 1 | 0 |
| A91 — Error Philosophy | 5 | 0 | 0 | 3 | 2 | 0 |
| A92 — i18n | 7 | 0 | 2 | 3 | 2 | 0 |
| A93 — Logging Quality | 6 | 0 | 1 | 2 | 3 | 0 |
| A94 — Docs | 7 | 0 | 0 | 2 | 5 | 0 |
| A95 — Scope Minimal | 3 | 0 | 0 | 1 | 2 | 0 |
| A96 — Skipped Bug Classes | 5 | 0 | 1 | 3 | 1 | 0 |
| A97 — CVE Advisory | 1 | 0 | 0 | 1 | 0 | 0 |
| A98 — 4 Reviewers | 20 | 0 | 3 | 12 | 5 | 0 |
| A99 — Black Friday | 7 | 1 | 3 | 3 | 0 | 0 |
| A100 — Final Paranoid | 28 | 1 | 5 | 14 | 8 | 0 |
| **Total** | **120** | **2** | **21** | **61** | **35** | **1** |

### Top 5 Recommendations (Immediate Action)

1. **A100-1 / A98-8**: Add absolute session lifetime cap to admin sessions (8h max).
2. **A92-1 / A92-2**: Localize newsletter confirmation emails using the existing `t()` function.
3. **A93-2**: Wire trace-ID correlation into API route loggers — currently zero routes use `logger.child()`.
4. **A100-3 / A100-4 / A100-20**: Replace 3× `JSON.parse(atob(base64))` with `jose.decodeJwt()` to prevent prototype pollution.
5. **A94-7 / A98-6**: Create the missing `docs/secrets-rotation-runbook.md` for SOC2 compliance.

### Strengths Observed

- Comprehensive security infrastructure: CSP nonces, CSRF double-submit, timing-safe comparisons, PII log redaction.
- Well-structured error taxonomy (`ApiErrorCode` enum) with client-safe detail redaction.
- Feature flag registry with enforced expiry dates and CI validation.
- Mature authorization model: server-derived site IDs prevent tenant boundary forgery.
- Defense-in-depth rate limiting: DO → KV → in-memory with configurable fail policies.
- 13 ADRs documenting key architectural decisions.
- 196 test files with coverage thresholds per critical path.

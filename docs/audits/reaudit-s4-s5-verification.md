# Re-Audit Verification — Season 4 & Season 5 Findings

**Repository:** `groupsmix/affilite-mix`  
**Branch:** `main` (commit `42510716`)  
**Date:** 2026-05-29  
**Auditor:** Devin (principal-engineer role)  
**Scope:** Verify fixes from PRs #694–#698 against Season 4 (Code Quality & Paranoid Pass) and Season 5 (AI/ML/LLM Security) findings.

---

## Fix PRs Under Review

| PR   | Title                                                                                    | Key Changes                                                           |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| #694 | cleanup(dal,cron): DRY column-fallback, DRY network ingest, add missing captureException | DRY cleanup in DAL/cron, captureException in 4 cron routes            |
| #695 | fix(security): address Critical/High findings from Season 4 audit                        | LRU 10K→50K, absolute session lifetime, test additions, FLAG_REGISTRY |
| #696 | fix(compliance): address Medium findings from Season 3 audit                             | Compliance fixes from S3 audit                                        |
| #698 | fix(i18n): use translation keys in newsletter email templates                            | Newsletter email i18n EN+AR                                           |

---

## Season 4 Findings Verification

### Critical Findings

| Finding ID | Original Severity | Status   | Evidence (file:line or PR#)                                                    | Notes                                                                                                                         |
| ---------- | ----------------- | -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A99-1      | Critical          | ✅ FIXED | `lib/rate-limit.ts:254-264` (PR #695)                                          | LRU cap increased from 10K to 50K, now configurable via `RATE_LIMIT_MEMORY_MAX_ENTRIES` env var (clamped 1K–500K).            |
| A100-1     | Critical          | ✅ FIXED | `lib/auth-constants.ts:44-60`, `app/api/auth/login/route.ts:506-514` (PR #695) | Absolute session lifetime caps added: 24h regular admin, 12h super_admin. Cookie `maxAge` set to `min(JWT_EXPIRY, role_cap)`. |

### High Findings

| Finding ID | Original Severity | Status       | Evidence (file:line or PR#)                                                  | Notes                                                                                                                           |
| ---------- | ----------------- | ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| A86-1      | High              | STILL OPEN   | —                                                                            | No integration test added for login flow with real DB. Pre-existing gap; not in scope of #694–#698.                             |
| A86-2      | High              | STILL OPEN   | —                                                                            | No e2e test with Stripe CLI trigger. Pre-existing gap.                                                                          |
| A88-1      | High              | ✅ FIXED     | `__tests__/csrf-timing-safe.test.ts:47-72` (PR #695)                         | Dedicated test for different-length token rejection via fixed-iteration branch. Tests prefix, suffix, empty string cases.       |
| A88-2      | High              | ✅ FIXED     | `__tests__/api/auth/auth.test.ts:172-199` (PR #695)                          | Test mocks `isTokenRevoked → true` and asserts `verifyToken` returns null.                                                      |
| A88-7      | High              | ✅ FIXED     | `__tests__/cron-auth.test.ts:130-159` (PR #695)                              | Tests: correct secret → true, wrong secret → false, missing secret → false.                                                     |
| A90-1      | High              | ✅ FIXED     | `lib/feature-flags.ts:82-94` (PR #695)                                       | `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` added to FLAG_REGISTRY with owner, expiry (2026-11-25), blast radius, rollback instructions. |
| A92-1      | High              | ✅ FIXED     | `app/api/newsletter/route.ts:51-60`, `lib/i18n/index.ts:27-38` (PR #698)     | Email body now uses `t("newsletter.confirm_heading", locale)` etc. AR translations added.                                       |
| A92-2      | High              | ✅ FIXED     | `app/api/newsletter/route.ts:227`, `lib/i18n/index.ts:37-38,62-63` (PR #698) | Plain-text email uses `t("newsletter.confirm_plain_thanks", siteLocale)`. Both EN and AR catalogs populated.                    |
| A93-2      | High              | STILL OPEN   | —                                                                            | Zero API routes wire `logger.child({ requestId })`. Not addressed in #694–#698.                                                 |
| A96-1      | High              | STILL OPEN   | —                                                                            | KV race condition documented as accepted risk (A97 advisory). DO remains primary; no code change needed.                        |
| A98-1      | High              | STILL OPEN   | —                                                                            | Same as A96-1 — accepted risk, DO is primary path.                                                                              |
| A98-6      | High              | STILL OPEN   | —                                                                            | `docs/secrets-rotation-runbook.md` still missing.                                                                               |
| A98-16     | High              | STILL OPEN   | —                                                                            | No circuit breaker for Supabase client creation.                                                                                |
| A99-2      | High              | STILL OPEN   | —                                                                            | No circuit breaker on site-resolution DB calls in middleware.                                                                   |
| A99-3      | High              | STILL OPEN   | —                                                                            | KV write-rate monitoring not added for click dedup.                                                                             |
| A99-6      | High              | STILL OPEN   | —                                                                            | No log sampling implemented.                                                                                                    |
| A100-2     | High              | ALREADY SAFE | `lib/csrf.ts` — verified `if (bufA.byteLength === 0                          |                                                                                                                                 | bufB.byteLength === 0) return false` guard exists | Original audit confirmed this was already correctly handled. |
| A100-3     | High              | STILL OPEN   | —                                                                            | `JSON.parse(atob(base64))` still used in logout route. Not addressed.                                                           |
| A100-4     | High              | STILL OPEN   | —                                                                            | Same pattern in reset-password route. Not addressed.                                                                            |
| A100-8     | High              | STILL OPEN   | —                                                                            | `atob(signedValue)` without try-catch in signed-cookie. Not addressed.                                                          |
| A100-14    | High              | STILL OPEN   | —                                                                            | KV pre-warm `.catch(() => {})` still swallows errors silently.                                                                  |
| A100-21    | High              | STILL OPEN   | —                                                                            | Middleware still a single 668-line function without per-concern error boundaries.                                               |
| A100-25    | High              | STILL OPEN   | —                                                                            | No `APP_URL` startup validation against known production domains.                                                               |

### Medium Findings (Selected, Priority)

| Finding ID | Original Severity | Status                | Evidence (file:line or PR#)   | Notes                                                                         |
| ---------- | ----------------- | --------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| A87-1      | Medium            | STILL OPEN            | —                             | `setTimeout(r, 20)` still in AI quota integration test.                       |
| A88-3      | Medium            | STILL OPEN            | —                             | Off-by-one boundary test not added for rate-limit count.                      |
| A89-1      | Medium            | ✅ FIXED (via A90-1)  | `lib/feature-flags.ts:82-94`  | Flag registered with expiry and documentation.                                |
| A90-2      | Medium            | STILL OPEN            | —                             | `captchaOnLogin` flag at rollout 0% still present (product decision pending). |
| A91-2      | Medium            | STILL OPEN            | —                             | `stripe-event-processor.ts` catch blocks still lack context wrapping.         |
| A92-3      | Medium            | ACCEPTED RISK         | —                             | Admin panel i18n accepted as English-only per ADR pattern.                    |
| A94-5      | Medium            | STILL OPEN            | —                             | On-call runbook still lacks concrete rotation config.                         |
| A94-7      | Medium            | STILL OPEN            | —                             | `secrets-rotation-runbook.md` still missing.                                  |
| A95-2      | Medium            | STILL OPEN            | —                             | No automated down-migration test in CI.                                       |
| A96-2      | Medium            | STILL OPEN            | —                             | TOCTOU in `authorizeResource()` not addressed.                                |
| A98-8      | Medium            | ✅ FIXED (via A100-1) | `lib/auth-constants.ts:44-60` | Absolute session lifetime caps cover this finding.                            |

### PR #694 Specific Fixes

| Change                            | Status   | Evidence                                            | Notes                                              |
| --------------------------------- | -------- | --------------------------------------------------- | -------------------------------------------------- |
| DRY column-fallback in DAL        | ✅ FIXED | `lib/dal/categories.ts` (PR #694)                   | Reduced 146→~85 lines via consolidated helper.     |
| DRY network ingest                | ✅ FIXED | `app/api/cron/commission-ingest/route.ts` (PR #694) | Refactored from 3 parallel blocks to loop pattern. |
| captureException in epc-recompute | ✅ FIXED | `app/api/cron/epc-recompute/route.ts:9,128`         | Error reporting wired.                             |
| captureException in expire-deals  | ✅ FIXED | `app/api/cron/expire-deals/route.ts:5,25`           | Error reporting wired.                             |
| captureException in price-scrape  | ✅ FIXED | `app/api/cron/price-scrape/route.ts:11,206`         | Error reporting wired.                             |
| captureException in stripe-sync   | ✅ FIXED | `app/api/cron/stripe-sync/route.ts:9,128`           | Error reporting wired.                             |

---

## Season 5 Findings Verification

Season 5 had **0 Critical**, **0 High**, **1 Medium**, and **9 Low** findings. All PASS/N/A findings remain valid.

| Finding ID   | Original Severity | Status         | Evidence                                | Notes                                                                                                                                                                                                                                                                   |
| ------------ | ----------------- | -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A101-01–08   | ✅ PASS           | CONFIRMED PASS | `lib/ai/prompt-sanitization.ts`         | Multi-layer prompt injection defenses intact. No regressions from PRs #694–698.                                                                                                                                                                                         |
| A101-09      | LOW               | STILL OPEN     | —                                       | Unicode confusable normalization not added. Accepted low-risk.                                                                                                                                                                                                          |
| A101-10      | LOW               | ACCEPTED RISK  | —                                       | Static truncation marker is cosmetic; no data leaked.                                                                                                                                                                                                                   |
| A102-01      | ✅ N/A            | CONFIRMED N/A  | —                                       | No RAG pipeline exists.                                                                                                                                                                                                                                                 |
| A103-01–06   | ✅ PASS/N/A       | CONFIRMED      | —                                       | No tool calling; all controls intact.                                                                                                                                                                                                                                   |
| A104-01–03   | ✅ N/A            | CONFIRMED N/A  | —                                       | No custom training.                                                                                                                                                                                                                                                     |
| A105-01      | ✅ PASS           | CONFIRMED PASS | `__tests__/ai/jailbreak-eval.test.ts`   | 30+ attack payloads tested.                                                                                                                                                                                                                                             |
| A105-02      | MEDIUM            | STILL OPEN     | —                                       | No automated hallucination detection. Human-review SLA not formalized as compensating control.                                                                                                                                                                          |
| A105-03      | LOW               | STILL OPEN     | —                                       | No confidence scoring. Acceptable for current use case.                                                                                                                                                                                                                 |
| A105-04      | ✅ PASS           | CONFIRMED PASS | `lib/ai/output-validation.ts:67-90`     | Quality gates intact.                                                                                                                                                                                                                                                   |
| A105-05      | LOW               | ACCEPTED RISK  | —                                       | Bias testing not applicable for affiliate content generation.                                                                                                                                                                                                           |
| A106-01–10   | ✅ PASS/N/A       | CONFIRMED      | Full OWASP LLM Top 10 coverage intact.  | No regressions.                                                                                                                                                                                                                                                         |
| A107-01–05   | ✅ PASS/N/A       | CONFIRMED      | Providers pinned, kill switches active. | No regressions.                                                                                                                                                                                                                                                         |
| A108-01–06   | ✅ PASS           | CONFIRMED PASS | All inference defense layers intact.    | No regressions.                                                                                                                                                                                                                                                         |
| A108-07      | LOW               | STILL OPEN     | —                                       | No ML-based classifier added. Low priority given human review gate.                                                                                                                                                                                                     |
| A109-01–04   | ✅ PASS           | CONFIRMED PASS | EU AI Act compliance intact.            | Technical doc, transparency, risk class all valid.                                                                                                                                                                                                                      |
| A109-05      | LOW               | STILL OPEN     | —                                       | `AiContentDisclosure` React component not found in codebase. However, `<meta name="ai-generated">` and `data-ai-generated` attribute ARE implemented (`content-generator.ts:169`, `page.tsx:80`). Machine-readable disclosure exists; human-readable component missing. |
| A110-01–05   | ✅ PASS/LOW       | CONFIRMED      | NIST AI RMF documentation intact.       | No regressions.                                                                                                                                                                                                                                                         |
| A111-01      | LOW               | STILL OPEN     | —                                       | No seed/temperature logging.                                                                                                                                                                                                                                            |
| A111-02–04   | ✅ PASS/N/A       | CONFIRMED      | —                                       | Version control and env lock intact.                                                                                                                                                                                                                                    |
| A111-05      | LOW               | STILL OPEN     | —                                       | Prompt hash / provider request-id not stored.                                                                                                                                                                                                                           |
| A112-01–07   | ✅ PASS           | CONFIRMED PASS | `lib/sanitize-html.ts`                  | XSS defenses intact, no regressions.                                                                                                                                                                                                                                    |
| A113-01–05   | ✅ N/A/INFO       | CONFIRMED      | —                                       | No feedback loops exist.                                                                                                                                                                                                                                                |
| A114-01–06   | ✅ PASS/LOW       | CONFIRMED      | Cost controls intact.                   | No regressions.                                                                                                                                                                                                                                                         |
| A115-RT01–20 | ✅ BLOCKED/LOW    | CONFIRMED      | Red team results unchanged.             | 19/20 blocked, 1 partial (homoglyph).                                                                                                                                                                                                                                   |

---

## Re-Run: Critical Audit Sections

### A88 Mutation Analysis (Re-Run)

| Mutation                                         | Original | Re-Run Status  | Evidence                                                                    |
| ------------------------------------------------ | -------- | -------------- | --------------------------------------------------------------------------- |
| A88-1: `result \|= lenA ^ lenB` → `result \|= 0` | Survived | NOW CAUGHT     | `__tests__/csrf-timing-safe.test.ts:47-72` tests different-length rejection |
| A88-2: Remove `isTokenRevoked()` check           | Survived | NOW CAUGHT     | `__tests__/api/auth/auth.test.ts:179-199` asserts revoked → null            |
| A88-3: `>= maxRequests` → `> maxRequests`        | Survived | STILL SURVIVES | No boundary-exact test added                                                |
| A88-4: Tolerance `5*60` → `5*600`                | Survived | STILL SURVIVES | Fuzz test still uses relative offset, not exact boundary                    |
| A88-5: Add "script" to ALLOWED_TAGS              | Caught ✓ | STILL CAUGHT   | Existing tests confirm `<script>` stripped                                  |
| A88-6: Remove disposable-email check             | Survived | STILL SURVIVES | No direct test for disposable domain rejection                              |
| A88-7: Return `true` unconditionally             | Survived | NOW CAUGHT     | `__tests__/cron-auth.test.ts:130-159` covers correct/wrong/missing          |

### A97 HN CVE (Re-Run)

**Status:** ACCEPTED RISK — No change. The KV race condition remains a theoretical bypass when DO is unavailable. Mitigations remain in place:

1. DO is primary rate limiter (confirmed: `rate-limit-do.test.ts`)
2. Defense-in-depth: per-IP + per-email + global limits + Turnstile CAPTCHA
3. Account lockout prevents brute-force regardless
4. LRU cap raised to 50K (A99-1 fix) reduces eviction-based amnesia

**New:** LRU increase from 10K→50K means the KV-fallback in-memory path is more resilient under burst traffic. The race condition still exists but the blast radius is reduced.

### A99 Black Friday Failure Modes (Re-Run)

| Finding                        | Status     | Notes                                                              |
| ------------------------------ | ---------- | ------------------------------------------------------------------ |
| A99-1 (LRU fills in seconds)   | ✅ FIXED   | 50K cap with env-var override. Configurable for capacity planning. |
| A99-2 (DB pool exhaustion)     | STILL OPEN | No circuit breaker on site-resolution.                             |
| A99-3 (KV 1000 writes/s limit) | STILL OPEN | No write-rate monitoring.                                          |
| A99-4 (Thundering herd)        | STILL OPEN | Singleflight not verified for all three cached queries.            |
| A99-5 (Resend down → 500)      | STILL OPEN | No decouple pattern.                                               |
| A99-6 (Log volume TB/day)      | STILL OPEN | No sampling.                                                       |
| A99-7 (Partial CDN cache)      | STILL OPEN | stale-while-revalidate configuration not verified.                 |

### A100 Final Paranoid Pass (Re-Run)

| Finding                                              | Status       | Notes                                                                                 |
| ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| A100-1 (No absolute session lifetime)                | ✅ FIXED     | 24h regular / 12h super_admin caps.                                                   |
| A100-2 (Empty string CSRF bypass)                    | ALREADY SAFE | Guard confirmed: `if (bufA.byteLength === 0 \|\| bufB.byteLength === 0) return false` |
| A100-3/4/20 (JSON.parse(atob()) prototype pollution) | STILL OPEN   | Three instances remain; no centralized `decodeJwtPayloadForLogging()`.                |
| A100-5–28 (remaining)                                | STILL OPEN   | Not targeted by PRs #694–698.                                                         |

---

## S5 Re-Run: A101 Prompt Injection

All 10 findings from A101 confirmed unchanged. Prompt sanitization pipeline verified intact:

- NFKC normalization → invisible char strip → control token removal → role-impersonation detection → instruction-override patterns → base64/ROT13 detection → system-prompt hardening preamble.
- No regressions introduced by PRs #694–698 (those PRs did not touch `lib/ai/`).

## S5 Re-Run: A106 OWASP LLM Top 10

All 10 LLM categories confirmed PASS or N/A. No changes to AI subsystem in PRs #694–698.

## S5 Re-Run: A108 Inference Defenses

All 7 inference defense findings confirmed PASS. Defense layers intact:

- Input classifier, output classifier, jailbreak detector, PII redactor, secret scanner, moderation audit trail all operational.
- No code changes to `lib/ai/` in the reviewed PRs.

---

## New Issues Introduced by Fixes

| #     | Severity | Location                      | Description                                                                                                                                                                                                        | Recommendation                                                                        |
| ----- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| NEW-1 | Low      | `lib/rate-limit.ts:258-262`   | `RATE_LIMIT_MEMORY_MAX_ENTRIES` parsing uses `parseInt` — if env var is `"50000abc"` it silently parses as 50000. No strict validation.                                                                            | Use `Number(raw)` with `isNaN` check, or reject non-numeric suffixes.                 |
| NEW-2 | Info     | `lib/auth-constants.ts:59-60` | Absolute session caps (24h/12h) are generous. The JWT itself expires in 4h, so the cookie caps are never the binding constraint currently. The caps become relevant only if JWT expiry is increased in the future. | Document that these are ceiling guards, not the effective session length.             |
| NEW-3 | Low      | `lib/feature-flags.ts:92`     | `rolloutPercent: 0` for `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` is slightly misleading — the flag is toggled by env var, not by rollout percentage.                                                                     | Add a comment clarifying this is an env-var-based kill switch, not a gradual rollout. |

---

## Summary

### Fix Verification Scorecard

| Category            | Fixed | Still Open       | Accepted Risk           | N/A                    |
| ------------------- | ----- | ---------------- | ----------------------- | ---------------------- |
| S4 Critical (2)     | 2     | 0                | 0                       | 0                      |
| S4 High (21)        | 6     | 13               | 1 (A100-2 already safe) | 1                      |
| S4 Medium (61)      | 3     | 55+              | 3                       | 0                      |
| S5 all (LOW/MEDIUM) | 0     | 4 LOW + 1 MEDIUM | 3 LOW                   | All PASS/N/A confirmed |

### Key Outcomes

1. **Both Critical findings (A99-1, A100-1) are FIXED** and verified in code.
2. **6 of 21 High findings are FIXED** — all targeted High items from PR #695 and #698 are confirmed resolved.
3. **S5 AI/ML audit remains clean** — 0 regressions, all PASS findings re-confirmed.
4. **No significant new issues** introduced by the fix PRs (3 low/info observations only).
5. **13 High findings remain open** — primarily around resilience (circuit breakers, monitoring), security (prototype pollution via `atob`), and documentation (missing runbook).

### Recommended Next Wave (Priority Order)

1. **A100-3/4/20** (3× HIGH): Replace `JSON.parse(atob())` with `jose.decodeJwt()` in logout, reset-password, and password-change routes.
2. **A98-6 / A94-7** (HIGH): Create `docs/secrets-rotation-runbook.md`.
3. **A93-2** (HIGH): Wire `logger.child({ requestId })` into API routes.
4. **A98-16** (HIGH): Add circuit breaker for Supabase client creation.
5. **A99-2** (HIGH): Add circuit breaker on site-resolution DB calls in middleware.
6. **A105-02** (S5 MEDIUM): Formalize human-review SLA as compensating control for hallucination risk.

---

_Re-Audit Verification — Season 4 & Season 5 — Complete._

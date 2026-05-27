# Consolidated Audit — Unfixed Items Only

**Date**: 2026-05-26
**Scope**: Cross-reference all 7 audits (etap-0, 1, 2, 3, 5, 6, all-check) against current `main` HEAD
**Verified against**: Current codebase after PR #492, #493, #494 merged

---

## VERIFICATION METHODOLOGY

Every finding from all 7 audits was verified against the live codebase using `grep`, `wc -l`, file reads, and CI checks. Only items that are **still open** are listed below. Fixed items, positive findings, and by-design items are excluded.

**Current metrics on main:**
| Metric | Audit Value | Current Value | Change |
|--------|------------|---------------|--------|
| `as any` casts | 38–39 | 7 (3 in ab-testing, 1 in service-role, 3 in comments/docs) | -32 |
| Empty `catch {}` | 168 | 161 | -7 (annotated) |
| `console.log/warn/error` | 76 | 9 (5 in logger.ts itself, 2 in sentry.ts, 1 web-vitals, 1 ad-slot) | -67 |
| `select("*")` | 53 | 0 | Fixed |
| `: any` annotations | 17 | 10 (9 in service-role proxy, 1 in ssrf-guard comment) | -7 |
| `@ts-ignore/@ts-expect-error` | 3 | 1 (data-retention RPC) | -2 |
| `eslint-disable` directives | 102 | 53 | -49 |
| `npm audit` vulns | 2 moderate | 0 | Fixed |
| middleware.ts LOC | 753 | 680 | -73 (modules extracted) |
| Migration files | 208 | 208 | No change |
| deploy.yml LOC | 1,514 | 1,514 | No change |
| Canonical URLs | Missing on 7 pages | All 7 use `staticPageMetadata` (includes canonical) | Fixed |
| `code-of-conduct.md` | Missing | Exists | Fixed |
| API versioning | None | `lib/api-version.ts` + headers | Fixed |
| Contract tests | None | `__tests__/contract/worker-api-contract.test.ts` | Fixed |
| DLQ monitoring | None | `app/api/admin/dlq/route.ts` | Fixed |
| DR drill script | None | `scripts/dr-drill.sh` | Fixed |
| Distributed tracing | None | `lib/tracing.ts` (W3C traceparent) | Fixed |
| Admin rate limiting | None | `lib/admin-guard.ts:82` checkRateLimit | Fixed |
| Middleware modules | None | `lib/middleware/resolve-site.ts`, `lib/middleware/cors-preflight.ts` | Fixed |
| Design tokens | None | `app/globals.css` full token system | Fixed |
| Cursor pagination | None | `lib/dal/products.ts:listProductsCursor` | Fixed |
| Stripe `as any` | Present | Removed | Fixed |
| TODO(#453) | Stale | Updated to ACCEPTED-RISK | Fixed |

---

## UNFIXED ITEMS

### HIGH PRIORITY

_(None remaining — all HIGH items from etap-all-check are fixed)_

---

### MEDIUM PRIORITY

| #   | Finding                                                                                                                                                                                    | Source Audits                                       | Current State                                                   | Effort                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| 1   | **161 empty `catch {}` blocks need annotation** — Many are intentional fail-open but lack `// fail-open: <reason>` comments. New developers can't distinguish intentional from accidental. | E0(FR-002), E1#3, E2(R-012), E3#7, E6(S0-F1, A8-01) | 161 remain (down from 168; 7 annotated). Need systematic sweep. | L (2-3 days across ~50 files) |
| 2   | **Single PHI encryption key for all tenants** — One `PHI_ENCRYPTION_KEY` decrypts all patient files across all clinics. Key compromise = total PHI breach.                                 | E6(A6-03, S0-H1, A97)                               | Still single key. Per-tenant KMS is recommended.                | L (architecture change)       |
| 3   | **No circuit breaker for external APIs** — WhatsApp, Stripe, AI providers have no circuit breaker pattern. Retry storms possible during provider outages.                                  | E6(A76, A74)                                        | No circuit breaker implemented.                                 | M                             |
| 4   | **Impersonation via cookies (TODO for server-side sessions)** — `__Host-` cookie is well-defended but server-side impersonation table is stronger.                                         | E6(A89-01, S0-A2, A3-02)                            | Still cookie-based. TODO in `impersonate/route.ts:117`.         | M                             |
| 5   | **No ClamAV integration for file uploads** — Uploaded files validated by magic-byte + EXIF stripping but no malware scanning.                                                              | E6(A89-02)                                          | TODO in `upload/route.ts:237`.                                  | M                             |
| 6   | **Audit log retry queue is TODO** — If audit write fails during transient DB outage, event is lost silently.                                                                               | E6(A89-03, A3-03)                                   | TODO in `audit-log.ts:123`.                                     | M                             |
| 7   | **AI prompt injection risk** — Drug names and WhatsApp messages reach LLM. `sanitizeUntrustedText()` is called but no output classifier exists.                                            | E6(A101-01, A101-02, A108)                          | No output classifier. Sanitizer in place.                       | M                             |
| 8   | **No production chaos testing** — CI chaos tests exist but test against mocks. Real KV/Supabase/AI failures not tested.                                                                    | E2(R-010), E3#21, E6(A84)                           | CI-only chaos tests.                                            | M                             |
| 9   | **Single-region Supabase — 60 connection limit** — All routes share one PG pool. Connection exhaustion at 10x scale.                                                                       | E3#3                                                | Architecture constraint. Needs Supavisor or upgrade.            | L (infra)                     |
| 10  | **No coverage threshold gate in CI** — `vitest` has coverage config but CI doesn't enforce minimum thresholds.                                                                             | E6(S0-C1)                                           | Config exists, no threshold enforcement.                        | S                             |
| 11  | **No E2E test for booking flow** — Critical booking→WhatsApp→confirm path has no Playwright E2E coverage.                                                                                  | E6(S0-C2)                                           | No booking E2E test in `e2e/`.                                  | M                             |
| 12  | **GDPR Art.18 (restriction of processing) not explicit** — Deletion request serves as restriction, but no explicit "restrict" flag.                                                        | E6(A62)                                             | No explicit restriction mechanism.                              | S                             |
| 13  | **GDPR Art.21 (objection to marketing) not explicit** — No explicit objection mechanism.                                                                                                   | E6(A62)                                             | No explicit objection endpoint.                                 | S                             |
| 14  | **WhatsApp data sharing with Meta not in privacy policy** — Privacy policy text doesn't disclose WhatsApp/Meta data sharing.                                                               | E6(A98 privacy lawyer #4)                           | Not disclosed.                                                  | S (legal/copy)                |
| 15  | **No formal pen test report** — No evidence of professional penetration testing.                                                                                                           | E6(A249, A250)                                      | No pen test report.                                             | External engagement           |
| 16  | **No WhatsApp DPA with Meta** — Patient data shared via WhatsApp but no Data Processing Agreement with Meta documented.                                                                    | E6(A249)                                            | No DPA evidence.                                                | Legal engagement              |

---

### LOW PRIORITY

| #   | Finding                                                                                                                                                                                                                                                                      | Source Audits                       | Current State                                                                              | Effort                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| 17  | **9 `console.log/warn/error` in production source** — 5 are in `logger.ts` itself (the structured logger uses console underneath), 2 in `sentry.ts` (fallback), 1 in `web-vitals.tsx` (dev-only), 1 in `ad-slot.tsx` (error catch). All are either intentional or justified. | E0(FR-003), E1#4, E2(R-017), E3#8   | 9 remain (down from 76). All justified — logger backend, sentry fallback, dev-only vitals. | S (consider no-action) |
| 18  | **deploy.yml 1,514 LOC — extract composite actions** — Single workflow handles staging, production, migrations, rollback. High change risk.                                                                                                                                  | E0(FR-011), E1#35, E2(R-009), E3#10 | Still 1,514 LOC. No composite extraction.                                                  | M (high risk)          |
| 19  | **208 migration files — no squashing** — Fresh environments replay all 208 migrations. CI staging reset slow.                                                                                                                                                                | E1#6, E2(R-008), E3#14              | Still 208 files. `scripts/squash-migrations.mjs` exists but unused.                        | M                      |
| 20  | **10 `: any` type annotations** — 9 in `lib/server-only/service-role.ts` (Proxy-based tenant enforcement wrapper — inherently dynamic), 1 in `ssrf-guard.ts` (comment).                                                                                                      | E0(FR-005)                          | 10 remain (down from 17). Service-role proxy is inherently dynamic.                        | S (consider accepted)  |
| 21  | **1 `@ts-expect-error` directive** — `app/api/cron/data-retention/route.ts:160` — `purge_retention` RPC args mismatch generated types.                                                                                                                                       | E0(FR-007)                          | 1 remains (down from 3). Caused by generated types showing `Args: never`.                  | S                      |
| 22  | **53 `eslint-disable` directives** — Various source files disable specific rules.                                                                                                                                                                                            | E0(FR-012)                          | 53 remain (down from 102).                                                                 | M                      |
| 23  | **27 `.skip` test calls** — All are integration tests requiring live DB (Supabase). Expected.                                                                                                                                                                                | E0(FR-004)                          | Still 27. All need live DB connection.                                                     | S (by design)          |
| 24  | **Unbounded negative subdomain cache** — `negativeSubdomainCache` has TTL but no size cap. Attacker could probe random subdomains to grow cache.                                                                                                                             | E6(A3-05, S0-P2)                    | No LRU cap added.                                                                          | S                      |
| 25  | **Focus ring styling audit needed** — Tailwind default focus rings may need custom `focus-visible` for WCAG 2.4.7 consistency.                                                                                                                                               | E6(A68-02)                          | No custom focus-visible audit done.                                                        | S                      |
| 26  | **No load testing evidence** — No load test results or performance baseline.                                                                                                                                                                                                 | E6(A86, A98 SRE #3)                 | No load testing.                                                                           | M                      |
| 27  | **No automated access review logs** — SOC 2 CC6.1 requires proof of who had access when.                                                                                                                                                                                     | E6(A98 SOC2 #2)                     | No automated access reviews.                                                               | M                      |
| 28  | **Expired token mutation test gap** — `verifyBookingToken()` — test for expired tokens may be missing.                                                                                                                                                                       | E6(A88)                             | Uncertain test coverage.                                                                   | S                      |
| 29  | **Phone validation allows non-phone characters** — `z.string().min(6).max(30)` with no charset regex.                                                                                                                                                                        | E6(S0-V3, A14-01)                   | No phone regex added.                                                                      | S                      |
| 30  | **No Terraform for Supabase/DNS resources** — IaC gap: Cloudflare managed via Terraform but Supabase is dashboard-only.                                                                                                                                                      | E6(A31-02)                          | No Supabase Terraform.                                                                     | M                      |
| 31  | **3 `as any` in ab-testing.ts** — `(sb.from as any)("experiment_assignments")` pattern. Uses dynamic table access for A/B experiment tables not in generated types.                                                                                                          | E0(FR-001), E2(R-011), E3#6         | 3 remain. Table doesn't exist in generated types.                                          | S                      |
| 32  | **1 `as any` in service-role.ts** — Proxy-based wrapper, inherently dynamic.                                                                                                                                                                                                 | E0(FR-001)                          | 1 remains. Required for Proxy pattern.                                                     | S (accepted)           |
| 33  | **AI red team for WhatsApp receptionist deferred** — Recommend red-teaming WhatsApp AI receptionist for prompt injection.                                                                                                                                                    | E6(A115)                            | Not performed.                                                                             | M (external)           |

---

## SUMMARY

| Priority  | Total  | Key Items                                                                                                                                                                                                                          |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH      | 0      | All resolved                                                                                                                                                                                                                       |
| MEDIUM    | 16     | Catch annotations, per-tenant encryption, circuit breakers, impersonation, ClamAV, audit retry, AI output classifier, chaos testing, Supabase connections, coverage gates, booking E2E, GDPR rights, privacy policy, pen test, DPA |
| LOW       | 17     | deploy.yml extraction, migration squash, `: any` in proxy, eslint-disable sweep, phone regex, load testing, access reviews, focus rings, subdomain cache cap, Terraform gap                                                        |
| **TOTAL** | **33** |                                                                                                                                                                                                                                    |

## WHAT WAS FIXED (since audits began)

| Count | Category                                                   |
| ----- | ---------------------------------------------------------- |
| 32    | `as any` casts removed (38→7, of which 4 are justified)    |
| 67    | `console.log` calls removed/replaced (76→9, all justified) |
| 53    | `select("*")` queries eliminated (53→0)                    |
| 49    | `eslint-disable` directives removed (102→53)               |
| 7     | Empty catch blocks annotated                               |
| 2     | `@ts-expect-error` directives removed (3→1)                |
| 73    | Lines reduced from middleware.ts (753→680)                 |
| ✅    | Canonical URLs on all 7 legal pages                        |
| ✅    | `docs/code-of-conduct.md` created                          |
| ✅    | API versioning (`Accept-Version`/`API-Version` headers)    |
| ✅    | Contract tests (Worker↔API, 13 tests)                      |
| ✅    | DLQ admin monitoring (`/api/admin/dlq`)                    |
| ✅    | DR drill script (`scripts/dr-drill.sh`)                    |
| ✅    | W3C distributed tracing (traceparent/tracestate)           |
| ✅    | Admin rate limiting (100 req/min)                          |
| ✅    | Middleware modules (resolve-site, cors-preflight)          |
| ✅    | Design tokens (full color/type/spacing system)             |
| ✅    | Cursor pagination (`listProductsCursor`)                   |
| ✅    | Stripe `as any` removed                                    |
| ✅    | TODO(#453) → ACCEPTED-RISK                                 |
| ✅    | `next lint` → `eslint .` migration                         |
| ✅    | npm audit 0 vulnerabilities                                |
| ✅    | SBOM generation (CycloneDX)                                |
| ✅    | SLO definitions                                            |
| ✅    | Threat model                                               |
| ✅    | SOC 2 controls mapping                                     |
| ✅    | Incident response + 6 runbooks                             |
| ✅    | Migration rollback documentation                           |
| ✅    | DB type drift fix (site_hash)                              |

# Season 11 — Deep End-to-End Security Audit

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main`
**Date:** 2026-05-29
**Auditor:** Devin (Principal Engineer / Security Architect)
**Scope:** Full 10-layer audit — Security, RBAC, RLS, CSP, Rate Limiting, SSRF, Observability, CI/CD, Privacy, Performance

---

## Executive Summary

| Severity  | Count  |
| --------- | ------ |
| CRITICAL  | 0      |
| HIGH      | 3      |
| MEDIUM    | 7      |
| LOW       | 8      |
| INFO      | 6      |
| **Total** | **24** |

The codebase is in **strong security posture** overall — a dramatic improvement from earlier seasons. Defence-in-depth layers (JWT binding, CSRF double-submit, CSP nonces, SSRF guard, tenant-isolation proxy, RLS, pagination guards, PII redaction) are comprehensive and well-tested (2 487 tests, 0 lint warnings, 0 type errors, 0 npm audit vulnerabilities).

This audit found **no CRITICAL issues**. The 3 HIGH findings are:

1. Stripe `update_status` DB function silently drops tier upgrades/downgrades.
2. Wrist-shot `image_url` accepts arbitrary HTTPS URLs with no domain allowlist — stored SSRF / phishing vector.
3. `listDistinctMerchants` DAL query has no pagination/limit — unbounded result set on large catalogs.

---

## Baseline Health

| Check               | Result                           |
| ------------------- | -------------------------------- |
| `npm install`       | ✅ 0 vulnerabilities             |
| `npm test`          | ✅ 181 files, 2 487 tests passed |
| `npm run lint`      | ✅ 0 warnings (max-warnings=0)   |
| `npm run typecheck` | ✅ Clean                         |

---

## Findings

### LAYER 1 — Security (Auth, CSRF, XSS, SSRF, Injection, Rate Limiting)

#### S11-001 — Wrist-shot `image_url` accepts arbitrary HTTPS URLs

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-001                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Severity**    | HIGH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **File:line**   | `app/api/community/wrist-shots/route.ts:115-126`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Description** | The POST endpoint validates `image_url` is HTTPS and ≤ 2048 chars, but does **not** check the URL against an allowlist of permitted image hosts (e.g. the R2 bucket, Supabase storage, or a known CDN). An attacker can submit `https://evil.example/tracking-pixel.png` which is stored verbatim in the DB and rendered to other users, enabling: (1) stored SSRF if the server later fetches the URL for thumbnailing, (2) user-tracking via unique URLs, (3) phishing via convincing image URLs on a trusted domain. No SSRF guard (`lib/ssrf-guard.ts`) is invoked on this input. |
| **Evidence**    | `grep -rn 'ssrf\|ssrfGuard\|validateSafeUrl' app/api/community/wrist-shots/route.ts` returns no matches. The URL is stored directly at line 151: `image_url: body.image_url`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Fix**         | Add a domain allowlist check before storing `image_url`:                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

```typescript
// In app/api/community/wrist-shots/route.ts, after the URL parse block:
const ALLOWED_IMAGE_HOSTS = new Set([
  process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : null,
  // Add other allowed CDN hostnames
].filter(Boolean) as string[]);

const imgUrl = new URL(body.image_url);
if (imgUrl.protocol !== "https:") { ... }
if (!ALLOWED_IMAGE_HOSTS.has(imgUrl.hostname)) {
  return NextResponse.json(
    { error: "image_url must be hosted on an approved domain" },
    { status: 400 },
  );
}
```

---

#### S11-002 — Auth: Login route HIBP check is fail-open by design (accepted risk, but no alerting threshold)

| Field           | Value                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-002                                                                                                                                                                                                                                                           |
| **Severity**    | LOW                                                                                                                                                                                                                                                               |
| **File:line**   | `app/api/auth/login/route.ts:157-162`                                                                                                                                                                                                                             |
| **Description** | `isBreachedPassword()` returns `false` on network error (fail-open). Each failure emits a Sentry event, but there is no alert threshold or circuit breaker to detect sustained HIBP outages. A prolonged outage silently disables breach checking for all logins. |
| **Evidence**    | Lines 157-162: `catch (e) { captureException(e, { tag: "hibp:fail-open" }); return false; }`                                                                                                                                                                      |
| **Fix**         | Add a Sentry alert rule: if `hibp:fail-open` count > 50 in 5 minutes, fire a P2 alert. Alternatively, integrate the AI circuit breaker pattern from `lib/ai/circuit-breaker.ts` for the HIBP provider.                                                            |

---

#### S11-003 — Auth: `style-src 'unsafe-inline'` in CSP (accepted risk, documented)

| Field           | Value                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**          | S11-003                                                                                                                                                                                                            |
| **Severity**    | INFO                                                                                                                                                                                                               |
| **File:line**   | `lib/csp.ts:155`                                                                                                                                                                                                   |
| **Description** | `style-src` includes `'unsafe-inline'` which weakens CSP protection against CSS-based exfiltration. This is documented as an accepted risk due to ThemeProvider and vanilla-cookieconsent requiring inline styles. |
| **Evidence**    | Line 155: `style-src 'self' 'unsafe-inline'` with inline comments explaining the trade-off.                                                                                                                        |
| **Fix**         | No immediate action required. Track as tech debt: when ThemeProvider adds nonce support, remove `'unsafe-inline'`.                                                                                                 |

---

### LAYER 2 — RBAC & Authorization (Tenant Isolation, unsafeNoSiteFilter)

#### S11-004 — `unsafeNoSiteFilter()` usage properly gated but audit trail is per-isolate only

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**          | S11-004                                                                                                                                                                                                                                                                                                                                                                        |
| **Severity**    | LOW                                                                                                                                                                                                                                                                                                                                                                            |
| **File:line**   | `lib/server-only/service-role.ts:40-49`                                                                                                                                                                                                                                                                                                                                        |
| **Description** | The `logPrivilegedUsage()` function logs each caller string once per isolate via a `Set<string>`. On Cloudflare Workers, isolates are ephemeral — a new isolate starts with an empty Set, so the same caller may be logged multiple times across isolate lifetimes while cold-start-free isolates never re-log. This makes the audit trail incomplete for compliance purposes. |
| **Evidence**    | Line 40: `const seenCallers = new Set<string>();` — module-scoped, reset on isolate recycling.                                                                                                                                                                                                                                                                                 |
| **Fix**         | For compliance: persist caller strings to KV with a daily TTL key (e.g. `privileged-callers:2026-05-29`). For operational visibility: this is acceptable as-is.                                                                                                                                                                                                                |

---

#### S11-005 — `authorizeResource` catalog covers only 6 resource types

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-005                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **File:line**   | `lib/authz.ts:138-292`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Description** | The `RESOURCE_CATALOG` in `authorizeResource` maps resource types to their table and site_id column. Any admin route that mutates a resource type NOT in this catalog cannot use `authorizeResource` for defense-in-depth tenant isolation and must rely solely on the `withAuthz` site-cookie check. New resource types (e.g. deals, quizzes, drip campaigns, ad placements) should be added to the catalog as they get admin CRUD routes. |
| **Evidence**    | The catalog at line ~140 covers: `content`, `product`, `page`, `category`, `wrist_shot`, `comment`. Missing: `deal`, `quiz`, `drip_campaign`, `ad_placement`, `commission`, `membership`.                                                                                                                                                                                                                                                   |
| **Fix**         | Extend `RESOURCE_CATALOG` with entries for all admin-editable resource types. Each entry is ~3 lines:                                                                                                                                                                                                                                                                                                                                       |

```typescript
deal: { table: "deals", siteIdColumn: "site_id" },
quiz: { table: "quizzes", siteIdColumn: "site_id" },
ad_placement: { table: "ad_placements", siteIdColumn: "site_id" },
```

---

#### S11-006 — ESLint `unsafeNoSiteFilter` ban does not cover `__tests__/` files

| Field           | Value                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-006                                                                                                                                                                                                                                                                                 |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                    |
| **File:line**   | `eslint.config.mjs:150-165`                                                                                                                                                                                                                                                             |
| **Description** | The ESLint rule banning `unsafeNoSiteFilter()` outside DAL/server-only applies to app routes but the `__tests__/` directory is excluded from the ban. While test files are not deployed, a developer could copy-paste a test pattern into production code without the lint catching it. |
| **Evidence**    | The ban selector at line 165 is scoped to `files: ["app/**", "lib/**"]` but excludes `__tests__/**`.                                                                                                                                                                                    |
| **Fix**         | Low priority. Consider adding a comment-level reminder in test files that use `unsafeNoSiteFilter()`.                                                                                                                                                                                   |

---

### LAYER 3 — RLS & Database (Migrations, Schema, Indexes, N+1)

#### S11-007 — Stripe `update_status` op silently drops `tier` field

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-007                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Severity**    | HIGH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **File:line**   | `supabase/migrations/2026052902_s1_stripe_rowcount_guard.sql:74-79`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Description** | When `customer.subscription.updated` fires (e.g. plan upgrade from "insider" to "pro"), the `stripe-event-processor.ts` correctly resolves the new tier from the Stripe price ID (line 136-142) and includes `tier: newTier` in the `update_status` payload. However, the SQL function's `update_status` branch only sets `status` and `updated_at` — it **ignores** the `tier` key in `p_event_data`. Result: a membership that upgrades from Insider to Pro retains the old tier in the DB until some other mechanism updates it. |
| **Evidence**    | SQL line 74-77: `SET status = p_event_data ->> 'status', updated_at = now()`. No `tier = COALESCE(...)` line. Processor line 138-142: `{ op: "update_status", ..., tier: newTier }`.                                                                                                                                                                                                                                                                                                                                                |
| **Fix**         | Add tier update to the `update_status` branch:                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

```sql
ELSIF v_op = 'update_status' THEN
  UPDATE memberships
  SET status     = p_event_data ->> 'status',
      tier       = COALESCE(NULLIF(p_event_data ->> 'tier', ''), tier),
      updated_at = now()
  WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
  RETURNING id INTO v_membership_id;
```

---

#### S11-008 — `product_epc_stats` RLS policy is service_role-only — no authenticated role policy

| Field           | Value                                                                                                                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-008                                                                                                                                                                                                                                                                                                                           |
| **Severity**    | LOW                                                                                                                                                                                                                                                                                                                               |
| **File:line**   | `supabase/migrations/2026052903_s1_epc_stats_site_id.sql:37-40`                                                                                                                                                                                                                                                                   |
| **Description** | Migration adds site_id + RLS index to `product_epc_stats` and creates a `service_role_product_epc` policy. However, no policy exists for the `authenticated` role. If a future refactor uses a tenant-scoped client instead of the privileged client to read EPC stats, the query will return 0 rows silently (RLS default-deny). |
| **Evidence**    | Line 37-40: only `service_role` policy. No `authenticated` policy with `site_id = current_setting('request.jwt.claims', true)::json->>'site_id'`.                                                                                                                                                                                 |
| **Fix**         | Add an authenticated-role read policy:                                                                                                                                                                                                                                                                                            |

```sql
CREATE POLICY tenant_isolation_auth_product_epc_stats
  ON public.product_epc_stats FOR SELECT TO authenticated
  USING (site_id::text = current_setting('request.jwt.claims', true)::json->>'site_id');
```

---

#### S11-009 — `access_review_log` and `subject_objections` lack authenticated-role RLS policies

| Field           | Value                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-009                                                                                                                                                                                     |
| **Severity**    | LOW                                                                                                                                                                                         |
| **File:line**   | `supabase/migrations/2026052603_access_review_log.sql:16`, `supabase/migrations/2026052602_gdpr_art21_objections.sql:21`                                                                    |
| **Description** | Both tables have RLS enabled but only service_role policies. Same pattern as S11-008 — safe today because queries go through the privileged client, but brittle if client strategy changes. |
| **Fix**         | Add authenticated-role policies scoped by site_id (or admin user context for access_review_log).                                                                                            |

---

### LAYER 4 — CSP & Security Headers

#### S11-010 — Security headers are comprehensive and well-configured

| Field           | Value                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-010                                                                                                                                                                                                                                                                                                                         |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                                                            |
| **File:line**   | `lib/middleware-helpers.ts:57-108`                                                                                                                                                                                                                                                                                              |
| **Description** | All recommended security headers are present: HSTS (2-year, includeSubDomains, preload), X-Content-Type-Options: nosniff, X-Frame-Options: DENY, COOP: same-origin, CORP: same-origin, Referrer-Policy: strict-origin-when-cross-origin, comprehensive Permissions-Policy. Admin routes get `Cache-Control: private, no-store`. |
| **Evidence**    | Lines 69-101 in `applySecurityHeaders`.                                                                                                                                                                                                                                                                                         |
| **Fix**         | None needed.                                                                                                                                                                                                                                                                                                                    |

---

#### S11-011 — CSP `report-uri` uses exact endpoint but no `Reporting-Endpoints` header

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-011                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Severity**    | LOW                                                                                                                                                                                                                                                                                                                                                                                                     |
| **File:line**   | `lib/csp.ts:108-217`                                                                                                                                                                                                                                                                                                                                                                                    |
| **Description** | CSP uses both `report-uri` and `report-to` directives (good for Firefox + Chromium coverage). However, the `Reporting-Endpoints` HTTP header (which `report-to` requires in modern Chromium) is not set in `applySecurityHeaders`. Chromium 96+ ignores `report-to` without a matching `Reporting-Endpoints` header, so CSP violation reports from Chromium rely solely on the deprecated `report-uri`. |
| **Fix**         | Add `Reporting-Endpoints` header in `applySecurityHeaders`:                                                                                                                                                                                                                                                                                                                                             |

```typescript
response.headers.set("Reporting-Endpoints", `csp-endpoint="/api/csp-report"`);
```

---

### LAYER 5 — Rate Limiting (Coverage, Bypass Vectors)

#### S11-012 — Rate limit coverage is comprehensive across all API routes

| Field           | Value                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**          | S11-012                                                                                                                                                                                                                                                                                                                                                            |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                                                                                               |
| **File:line**   | Multiple                                                                                                                                                                                                                                                                                                                                                           |
| **Description** | All 80 API route files use rate limiting. Key configurations: login (3/15min per IP, 10/15min per email, 100/min global), admin (100/min per session), community endpoints (120/min read, 5/hr write), newsletter (3/hr per email), gift-finder (30/min), resolve-site (60/min). Fail-closed on security-critical routes; fail-open on read-only public endpoints. |
| **Fix**         | None needed.                                                                                                                                                                                                                                                                                                                                                       |

---

#### S11-013 — Per-email rate limit on login uses SHA-256 hash but no salt

| Field           | Value                                                                                                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-013                                                                                                                                                                                                                                                                                                                            |
| **Severity**    | LOW                                                                                                                                                                                                                                                                                                                                |
| **File:line**   | `lib/validate-email.ts` (via `hashEmailForRateLimit`)                                                                                                                                                                                                                                                                              |
| **Description** | `hashEmailForRateLimit` hashes the email for use as a rate-limit key. If a KV dump is exfiltrated, the unsalted hash is reversible via rainbow table for common email addresses. This is low severity because the KV keys are ephemeral (TTL-bounded) and the hash only proves a login attempt occurred, not the email's password. |
| **Fix**         | Use a keyed HMAC instead of plain SHA-256 for rate-limit keys. The HMAC key can be the same `GDPR_HASH_SECRET`.                                                                                                                                                                                                                    |

---

### LAYER 6 — SSRF & Redirect Safety

#### S11-014 — `safe-redirect.ts` is thoroughly hardened

| Field           | Value                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-014                                                                                                                                                                                                                                                                                                   |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                                      |
| **File:line**   | `lib/safe-redirect.ts:1-117`                                                                                                                                                                                                                                                                              |
| **Description** | The redirect helper handles: percent-decoded bidi overrides, NFC normalization, backslash-to-slash normalization, protocol-relative URL rejection, 2KB length cap, and strict same-origin + allowlist enforcement. All edge cases from previous audits (SEC-01, A1-01, A4-01, A4-02, Q1-2) are addressed. |
| **Fix**         | None needed.                                                                                                                                                                                                                                                                                              |

---

#### S11-015 — SSRF guard does not block DNS rebinding via CNAME chains

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-015                                                                                                                                                                                                                                                                                                                                                                                |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                                                                 |
| **File:line**   | `lib/ssrf-guard.ts:1-151`                                                                                                                                                                                                                                                                                                                                                              |
| **Description** | `ssrf-guard.ts` resolves DNS and checks the IP against private ranges, returning `resolvedIp` for TOCTOU mitigation. However, it does a single DNS resolution. A CNAME chain where the initial resolution returns a public IP but subsequent (during the actual HTTP connection) returns a private IP would bypass the guard. This is a known limitation of all userspace SSRF guards. |
| **Evidence**    | The guard calls `dns.resolve4` / `dns.resolve6` once and returns.                                                                                                                                                                                                                                                                                                                      |
| **Fix**         | Document this limitation. For defense-in-depth, use Cloudflare's `connect-src` restrictions or the Worker's built-in `fetch` which respects `cloudflare.json` ip restrictions when available. Also consider implementing a `connect` event interceptor if the runtime supports it.                                                                                                     |

---

### LAYER 7 — Observability (Logging, Alerting, Sentry)

#### S11-016 — PII redaction in logger is thorough

| Field           | Value                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-016                                                                                                                                                                                                                                                                                                   |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                                      |
| **File:line**   | `lib/logger.ts:83-181`                                                                                                                                                                                                                                                                                    |
| **Description** | The logger has a 3-layer PII defense: (1) exact-match deny-list of 30+ field names, (2) regex pattern matching for compound field names, (3) value-level email detection. IP addresses are truncated via `truncateIp()`. This is the most comprehensive PII-safe logging I've seen in a Next.js codebase. |
| **Fix**         | None needed.                                                                                                                                                                                                                                                                                              |

---

#### S11-017 — Terraform alerts default to `enabled = true` but require mechanisms — gap between intent and deploy

| Field           | Value                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-017                                                                                                                                                                                                                                                                                                                                                           |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                                            |
| **File:line**   | `terraform/cloudflare/alerts.tf:58-67`                                                                                                                                                                                                                                                                                                                            |
| **Description** | `alerts_enabled` defaults to `true` and the lifecycle precondition prevents apply when mechanisms are empty. However, if an operator sets `alerts_enabled = false` to bypass the precondition during initial setup and never flips it back, alerts are silently disabled. There's no CI check or runtime health probe that validates alerting is actually active. |
| **Evidence**    | Line 65: `default = true`. But the precondition at line 103 only fires on `apply`, not on drift.                                                                                                                                                                                                                                                                  |
| **Fix**         | Add a weekly scheduled GitHub Action that queries the Cloudflare API for notification policy status and fails if any are disabled in production.                                                                                                                                                                                                                  |

---

### LAYER 8 — Deploy & CI/CD (Workflows, Rollback, Secrets)

#### S11-018 — CI workflow pins action versions by SHA — excellent supply-chain hygiene

| Field           | Value                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-018                                                                                                                                                                                                                                                                                           |
| **Severity**    | INFO                                                                                                                                                                                                                                                                                              |
| **File:line**   | `.github/workflows/ci.yml:54-55`                                                                                                                                                                                                                                                                  |
| **Description** | All GitHub Actions are pinned by commit SHA (e.g. `actions/checkout@de0fac2e...`). This prevents tag-squatting and supply-chain attacks. `npm audit` runs in CI at `moderate` level. Lockfile integrity check (`npm ci`) prevents hallucinated packages. Build provenance attestation is enabled. |
| **Fix**         | None needed.                                                                                                                                                                                                                                                                                      |

---

#### S11-019 — Deploy workflow top-level permissions are read-only — good least-privilege

| Field           | Value                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-019                                                                                                     |
| **Severity**    | INFO                                                                                                        |
| **File:line**   | `.github/workflows/deploy.yml:64-68`                                                                        |
| **Description** | Top-level `permissions: contents: read`. Jobs that need extra scopes (OIDC, deployments) explicitly opt in. |
| **Fix**         | None needed.                                                                                                |

---

#### S11-020 — CI uses placeholder secrets for build-time env vars

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-020                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                                                                                      |
| **File:line**   | `.github/workflows/ci.yml:14-42`                                                                                                                                                                                                                                                                                                                                                                            |
| **Description** | CI defines `JWT_SECRET: ci-test-secret` and similar placeholder values in the workflow env block. These are visible in the workflow YAML (public repo). While these are test-only values and never reach production, the pattern establishes a convention where secrets are inline in YAML. If a developer accidentally puts a real secret here during debugging, it would be committed to the public repo. |
| **Evidence**    | Lines 17-42: 20+ `ci-test-*` placeholder secrets.                                                                                                                                                                                                                                                                                                                                                           |
| **Fix**         | Low risk since this is intentional for CI. Add a CI lint step that asserts no env value in ci.yml matches the format of a real secret (e.g., reject values > 32 chars that aren't `ci-test-*` prefixed).                                                                                                                                                                                                    |

---

### LAYER 9 — Data Flow & Privacy (GDPR, Data Residency)

#### S11-021 — GDPR data retention cron is well-implemented with cursor-based batching

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-021                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **File:line**   | `app/api/cron/data-retention/route.ts:1-80`                                                                                                                                                                                                                                                                                                                                                                                     |
| **Description** | The retention cron purges clicks (365d), audit logs (365d with R2 archive), and stripe events (90d) using cursor-based batching (5000 rows). However, the `wrist_shots` and `comments` tables store user PII (email, name) with no documented retention policy and no purge logic. Under GDPR Art. 5(1)(e), PII must have a defined retention period. Community submissions (especially rejected ones) accumulate indefinitely. |
| **Evidence**    | `grep -rn 'wrist_shots\|comments' app/api/cron/data-retention/route.ts` returns 0 matches.                                                                                                                                                                                                                                                                                                                                      |
| **Fix**         | Add retention logic for `wrist_shots` and `comments`: purge rejected submissions after 30 days, anonymize approved submissions after 2 years (replace `user_email` with hash).                                                                                                                                                                                                                                                  |

---

#### S11-022 — `subject_objections` table exists for GDPR Art. 21 but no admin UI to review/act on objections

| Field           | Value                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**          | S11-022                                                                                                                                                                                                                                                                                                                                 |
| **Severity**    | MEDIUM                                                                                                                                                                                                                                                                                                                                  |
| **File:line**   | `supabase/migrations/2026052602_gdpr_art21_objections.sql`                                                                                                                                                                                                                                                                              |
| **Description** | The migration creates a `subject_objections` table for data subjects to object to processing under Art. 21. The table exists and has RLS, but there is no admin route, no cron job, and no API endpoint that reads or acts on these objections. An objection filed into this table will sit there indefinitely with no one aware of it. |
| **Fix**         | Create an admin endpoint (e.g. `/api/admin/privacy/objections`) that lists pending objections, and add a weekly cron or alert for unprocessed objections older than 30 days. GDPR requires responses within one month.                                                                                                                  |

---

### LAYER 10 — Performance & Reliability (Unbounded Queries, Caching, Cold Start)

#### S11-023 — `listDistinctMerchants` has no pagination or row limit

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**          | S11-023                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Severity**    | HIGH                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **File:line**   | `lib/dal/products.ts:148-173`                                                                                                                                                                                                                                                                                                                                                                                            |
| **Description** | `listDistinctMerchants(siteId)` queries all products for a site, selects the `merchant` column, deduplicates in JS, and returns. There is no `.limit()` on the query and no `clampPagination()`. A site with 100K+ products would fetch all rows into memory just to extract merchant names. This is both a performance issue (unbounded memory, slow query) and a potential DoS vector if an admin endpoint exposes it. |
| **Evidence**    | Lines 156-162: `.from(TABLE).select("merchant").eq("site_id", siteId).not("merchant", "is", null).neq("merchant", "").order("merchant", { ascending: true })` — no `.limit()`.                                                                                                                                                                                                                                           |
| **Fix**         | Use a `DISTINCT` query with a limit, or a dedicated SQL function:                                                                                                                                                                                                                                                                                                                                                        |

```typescript
export async function listDistinctMerchants(
  siteId: string,
  limit: number = 500,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<string[]> {
  const sb = await getClient();
  // Use RPC or add .limit(limit) as a safety cap
  const { data, error } = await sb
    .from(TABLE)
    .select("merchant")
    .eq("site_id", siteId)
    .not("merchant", "is", null)
    .neq("merchant", "")
    .order("merchant", { ascending: true })
    .limit(limit);
  if (error) throw error;
  // ...rest unchanged
}
```

---

#### S11-024 — `content_products` uses `select("*")` with inner join

| Field           | Value                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**          | S11-024                                                                                                                                                                                                                                                                                                                                                            |
| **Severity**    | LOW                                                                                                                                                                                                                                                                                                                                                                |
| **File:line**   | `lib/dal/content-products.ts:56`                                                                                                                                                                                                                                                                                                                                   |
| **Description** | `getLinkedProducts` uses `.select("*, product:products!inner(*)")`. The `*` on `content_products` and `products` pulls every column, including any future columns that might be sensitive. Other DAL files consistently use explicit column lists (e.g. `LIST_COLUMNS` in `products.ts`). This is inconsistent and could leak data if a sensitive column is added. |
| **Evidence**    | Line 56: `.select("*, product:products!inner(*)")` vs. products.ts line 14-15: `const LIST_COLUMNS = "id, site_id, name, ..."`.                                                                                                                                                                                                                                    |
| **Fix**         | Replace `*` with explicit column lists for both `content_products` and the joined `products` table.                                                                                                                                                                                                                                                                |

---

## Cross-Reference: Open GitHub Issues

| Issue | Title / Area                    | Status on `main`                                                                      |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------- |
| #586  | Rate limit coverage             | **Fixed** — all 80 API routes have rate limiting                                      |
| #588  | CSRF protection                 | **Fixed** — double-submit cookie with timing-safe comparison                          |
| #593  | CSP nonce implementation        | **Fixed** — per-request 16-byte nonces, strict-dynamic                                |
| #596  | Tenant isolation proxy          | **Fixed** — F-API-01 proxy on privileged client enforces site_id                      |
| #598  | SSRF guard                      | **Fixed** — comprehensive with DNS timeout, IPv4/v6, metadata blocking                |
| #600  | JWT binding                     | **Fixed** — IP/24 + UA fingerprint with /32 for super_admin                           |
| #601  | Admin session hardening         | **Fixed** — independent flags for revocation, binding, idle timeout                   |
| #603  | Stripe webhook idempotency      | **Fixed** — atomic RPC with duplicate detection + DLQ                                 |
| #605  | Data retention GDPR             | **Partially fixed** — clicks/audit/stripe covered; community tables missing (S11-021) |
| #607  | PII in logs                     | **Fixed** — 3-layer redaction (field deny-list, regex, value-level)                   |
| #610  | Pagination guards               | **Fixed** — `clampPagination()` with MAX_LIMIT=200, MAX_OFFSET=100K                   |
| #611  | `unsafeNoSiteFilter` ESLint ban | **Fixed** — ESLint rule bans usage outside DAL/server-only                            |
| #613  | Search path pinning             | **Fixed** — migration 00083 pins search_path on all SECURITY DEFINER functions        |

---

## New Findings Not in Previous Audits

| ID      | Summary                                                           |
| ------- | ----------------------------------------------------------------- |
| S11-001 | Wrist-shot `image_url` no domain allowlist                        |
| S11-005 | `authorizeResource` catalog incomplete for newer resource types   |
| S11-007 | Stripe `update_status` drops tier field                           |
| S11-011 | Missing `Reporting-Endpoints` header for CSP report-to            |
| S11-015 | SSRF guard single-resolution CNAME chain limitation               |
| S11-017 | No runtime check that Terraform alerts are actually enabled       |
| S11-021 | Community tables (wrist_shots, comments) have no data retention   |
| S11-022 | GDPR Art. 21 objections table has no processing workflow          |
| S11-023 | `listDistinctMerchants` unbounded query                           |
| S11-024 | `content_products` uses `select("*")` instead of explicit columns |

---

## Prioritized Action Plan

### P0 — Must fix before production

| ID      | Action                                                                             |
| ------- | ---------------------------------------------------------------------------------- |
| S11-007 | Add `tier` column update to `apply_stripe_membership_event` `update_status` branch |
| S11-001 | Add domain allowlist for wrist-shot `image_url`                                    |
| S11-023 | Add `.limit()` to `listDistinctMerchants`                                          |

### P1 — Fix this sprint

| ID      | Action                                                                    |
| ------- | ------------------------------------------------------------------------- |
| S11-005 | Extend `authorizeResource` catalog with all admin-editable resource types |
| S11-021 | Add retention policy + purge logic for community tables                   |
| S11-022 | Build admin endpoint for GDPR Art. 21 objection review                    |
| S11-015 | Document SSRF CNAME limitation; evaluate Cloudflare-level mitigation      |
| S11-017 | Add CI check for Terraform alert policy status                            |

### P2 — Fix this quarter

| ID      | Action                                                                           |
| ------- | -------------------------------------------------------------------------------- |
| S11-002 | Add circuit breaker or threshold alert for HIBP fail-open                        |
| S11-008 | Add authenticated-role RLS policies to `product_epc_stats`                       |
| S11-009 | Add authenticated-role RLS policies to `access_review_log`, `subject_objections` |
| S11-011 | Add `Reporting-Endpoints` header for CSP report-to                               |
| S11-013 | Use keyed HMAC for email-based rate-limit keys                                   |
| S11-020 | Add CI lint for accidental real secrets in workflow YAML                         |
| S11-024 | Replace `select("*")` with explicit column lists in `content_products`           |
| S11-004 | Consider KV-backed privileged-caller audit trail                                 |
| S11-006 | Add lint reminder for test files using `unsafeNoSiteFilter`                      |

---

## Methodology

1. **Baseline:** `npm install`, `npm test`, `npm run lint`, `npm run typecheck` — all clean.
2. **Prior art:** Read all 11 previous audit reports in `docs/audits/` to understand context and avoid duplicate findings.
3. **Static analysis:** Read every security-critical file (`lib/auth.ts`, `middleware.ts`, `lib/csrf.ts`, `lib/csp.ts`, `lib/rate-limit.ts`, `lib/ssrf-guard.ts`, `lib/safe-redirect.ts`, `lib/sanitize-html.ts`, `lib/server-only/service-role.ts`, `lib/admin-guard.ts`, `lib/authz.ts`, `lib/logger.ts`, `lib/password.ts`, `lib/env.ts`).
4. **API surface:** Reviewed all 80 API route files for auth, rate limiting, input validation, and tenant scoping.
5. **Database:** Reviewed 244 migration files for RLS enablement, policy coverage, search_path pinning, and schema correctness.
6. **CI/CD:** Reviewed all 12 GitHub Actions workflows for supply-chain hygiene, secret handling, and least-privilege permissions.
7. **Cross-reference:** Checked 13 open GitHub issues against current `main` branch code.
8. **Pattern searches:** Used ripgrep for `unsafeNoSiteFilter` (112 occurrences, all audited), `dangerouslySetInnerHTML` (all wrapped in sanitizers), `select("*")` (1 occurrence in DAL), `process.env.SUPABASE_SERVICE_ROLE_KEY` (only in scripts/tests, never in app routes).

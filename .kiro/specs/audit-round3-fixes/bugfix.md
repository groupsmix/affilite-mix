# Bugfix Requirements Document

## Introduction

This document captures the findings of a broad, multi-domain (Round 3) audit of the
`affilite-mix` repository and turns them into an actionable remediation plan. It is
intended to be handed to an implementing coding agent — **no code changes are made by
this document**. Each finding is expressed in the bug-condition methodology: the current
(defective) behavior, the expected (correct) behavior, and the unchanged behavior that
must be preserved (regression prevention).

Findings are grouped by domain. Each finding carries:

- A **severity** tag — `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`.
- A **verification** tag — `VERIFIED` (confirmed against the code during this audit) or
  `REPORTED` (needs code verification by the implementing agent before fixing).

Domain sections are ordered so that the highest-impact security and data-integrity
findings appear first. Within each domain, findings are ordered by severity.

### Scope Exclusions (DO NOT action under this spec)

The following were explicitly excluded from this spec:

- **`app/web-vitals.tsx` "next/web-vitals removed in Next 15" build-blocker — FALSE
  POSITIVE.** The repo runs `next@~15.5.18` and `useReportWebVitals` from `next/web-vitals`
  is valid in Next 15. No action required.
- **Already covered by the existing `audit-round2-fixes` spec — do NOT duplicate:**
  - Cross-tenant anonymous over-read RLS gap
  - Double-billing / orphaned second Stripe subscription
  - Reverse reconciliation gap
  - TOTP persist-after-verify race
  - `tenant_isolation` init-plan performance regression

### How to read the clause numbering

Each finding is a numbered section `X`. Within a finding, clauses use `X.Y`:

- `X.1*` clauses describe **Current Behavior (Defect)**.
- `X.2*` clauses describe **Expected Behavior (Correct)**.
- `X.3*` clauses describe **Unchanged Behavior (Regression Prevention)**.

## Bug Analysis

The remediation is organized into the following domains:

- **Domain A — Docker / Integration Stack** (auth, RLS, secrets)
- **Domain B — `lib/` Runtime Security** (sessions, RLS guard, fetch safety, CSRF)
- **Domain C — E2E Test Suite** (secret leakage, live-quota burn, false-green assertions)
- **Domain D — Config / Database Schema** (`"compare"` template constraint mismatch)
- **Domain E — `.github` CI/CD** (shell injection, permissions, misleading gates)
- **Domain F — `.semgrep` Security Rules** (bypassable / noisy / mislabeled rules)
- **Domain G — Root `app/` Files** (token conflicts, leaked routes, caching)
- **Domain H — `config/` Builders** (input mutation, fragile feature resolution)
- **Domain I — `scripts/`** (silent validation, partial rotation)
- **Domain J — `workers/`** (instrumentation, SSRF blocklist, replay)
- **Domain K — `types/` & Test Coverage** (dead types, low thresholds)

---

## Domain A — Docker / Integration Stack

### 1. JWT secret mismatch breaks every PostgREST call — `[CRITICAL][REPORTED]`

`DOCKER-01`. `docker-compose.yml` requires `LOCAL_JWT_SECRET` from `.env.local` (no
fallback), but `integration-env.sh` exports hardcoded demo JWTs signed with a different
key.

#### Current Behavior (Defect)

1.11 WHEN a real `LOCAL_JWT_SECRET` is set in `.env.local` and the stack issues a request to PostgREST with the demo JWT from `integration-env.sh` THEN the system rejects the request with HTTP 401 because the token signature does not match the configured secret.

#### Expected Behavior (Correct)

1.21 WHEN a real `LOCAL_JWT_SECRET` is set in `.env.local` THEN the system SHALL use demo JWTs that are signed with that same secret (or derive both from a single source) so PostgREST accepts the request.
1.22 WHEN the configured secret and the issued JWT signing key diverge THEN the system SHALL fail fast at startup with a clear diagnostic rather than failing on every runtime request.

#### Unchanged Behavior (Regression Prevention)

1.31 WHEN the demo/default secret is used consistently across both the compose config and `integration-env.sh` THEN the system SHALL CONTINUE TO authenticate PostgREST calls successfully in a fresh local environment.

### 2. Missing `--env-file .env.local` prevents stack startup — `[CRITICAL][REPORTED]`

`DOCKER-02`. `docs/local-supabase.md` examples and `integration-env.sh` comments omit
`--env-file .env.local`; compose will not start without it.

#### Current Behavior (Defect)

2.11 WHEN a developer follows the documented commands verbatim THEN the system fails to start because compose cannot resolve required variables without `--env-file .env.local`.

#### Expected Behavior (Correct)

2.21 WHEN a developer follows the documentation THEN the system SHALL include `--env-file .env.local` (or an equivalent default) in every documented `docker compose` invocation so the stack starts.

#### Unchanged Behavior (Regression Prevention)

2.31 WHEN the documented commands already specify the env file THEN the system SHALL CONTINUE TO start the stack correctly.

### 3. Kong key-auth plugin never applied to a route/service — `[HIGH][REPORTED]`

`DOCKER-03`. `key-auth` is in `KONG_PLUGINS` and consumers have `keyauth_credentials`,
but the plugin is never attached to any route/service in `kong.yml`.

#### Current Behavior (Defect)

3.11 WHEN a client calls a Kong-fronted route THEN the system ignores the `apikey` header because the key-auth plugin is not bound to any route or service.

#### Expected Behavior (Correct)

3.21 WHEN a client calls a route that is intended to be key-protected THEN the system SHALL enforce key-auth by binding the plugin to the appropriate route or service in `kong.yml`.

#### Unchanged Behavior (Regression Prevention)

3.31 WHEN a route is intentionally public THEN the system SHALL CONTINUE TO allow unauthenticated access to that route.

### 4. MinIO root credentials hardcoded in version control — `[HIGH][REPORTED]`

`DOCKER-04`. `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` are hardcoded as
`minioadmin`/`minioadmin`.

#### Current Behavior (Defect)

4.11 WHEN the stack starts THEN the system uses default `minioadmin`/`minioadmin` credentials checked into version control, exposing object storage to trivially guessable access.

#### Expected Behavior (Correct)

4.21 WHEN the stack starts THEN the system SHALL source MinIO root credentials from `.env.local` (or an equivalent untracked secret source) with no hardcoded default in committed files.

#### Unchanged Behavior (Regression Prevention)

4.31 WHEN valid credentials are supplied via the secret source THEN the system SHALL CONTINUE TO start MinIO and serve object storage locally.

### 5. PostgREST connects as `postgres` superuser, bypassing RLS — `[HIGH][REPORTED]`

`DOCKER-05`. PostgREST connects as the `postgres` superuser, so any JWT with role
`postgres` bypasses all RLS.

#### Current Behavior (Defect)

5.11 WHEN PostgREST connects to the database THEN the system connects as the `postgres` superuser, and any JWT asserting role `postgres` bypasses all row-level security.

#### Expected Behavior (Correct)

5.21 WHEN PostgREST connects to the database THEN the system SHALL connect as a dedicated, non-superuser authenticator role whose RLS policies are enforced.

#### Unchanged Behavior (Regression Prevention)

5.31 WHEN a legitimate `anon` or `authenticated` JWT is used THEN the system SHALL CONTINUE TO return the same RLS-scoped results it returns today.

### 6. Docker stack hardening gaps (grouped) — `[MEDIUM/LOW][REPORTED]`

A collection of smaller integration-stack robustness issues.

#### Current Behavior (Defect)

6.11 WHEN `PGRST_APP_SETTINGS_JWT_SECRET` is unset THEN the system starts without it because the variable is not enforced with a `:?` guard.
6.12 WHEN the stack depends on Mailpit THEN the system has no Mailpit healthcheck, so dependents may start before it is ready.
6.13 WHEN Kong starts THEN the system uses a non-condition-based `depends_on`, so Kong may start before its dependencies are healthy.
6.14 WHEN migrations run repeatedly THEN the system lacks a migration idempotency guard.
6.15 WHEN `kong.yml` is parsed THEN the system contains an invalid `_comment` field.
6.16 WHEN comparing local Postgres to production THEN the system runs PG15 locally vs PG17 in production (parity gap).
6.17 WHEN a developer sets up the project THEN the system provides no `.env.local.example` template.

#### Expected Behavior (Correct)

6.21 WHEN `PGRST_APP_SETTINGS_JWT_SECRET` is unset THEN the system SHALL fail fast via a `:?` guard.
6.22 WHEN the stack defines Mailpit THEN the system SHALL include a Mailpit healthcheck and condition dependents on it.
6.23 WHEN Kong depends on other services THEN the system SHALL use condition-based `depends_on` (`service_healthy`).
6.24 WHEN migrations run THEN the system SHALL apply an idempotency guard so re-runs are safe.
6.25 WHEN `kong.yml` is parsed THEN the system SHALL omit the invalid `_comment` field.
6.26 WHEN choosing the local Postgres image THEN the system SHALL align the local major version with production (PG17).
6.27 WHEN a developer sets up the project THEN the system SHALL provide a committed `.env.local.example` template.

#### Unchanged Behavior (Regression Prevention)

6.31 WHEN all required variables and healthchecks are satisfied THEN the system SHALL CONTINUE TO start the full local stack and run migrations successfully.

---

## Domain B — `lib/` Runtime Security

### 7. Idle session timeout defaults OFF — `[CRITICAL][REPORTED]`

`lib/auth.ts`. The 30-minute idle timeout defaults OFF and fails to invalidate sessions
for standard deployments.

#### Current Behavior (Defect)

7.11 WHEN a standard deployment runs without explicitly enabling the idle timeout THEN the system never invalidates idle sessions, leaving sessions valid indefinitely.

#### Expected Behavior (Correct)

7.21 WHEN a deployment runs with default configuration THEN the system SHALL enforce a safe default idle timeout (e.g. 30 minutes) and invalidate sessions that exceed it.

#### Unchanged Behavior (Regression Prevention)

7.31 WHEN a session is active within the idle window THEN the system SHALL CONTINUE TO keep the session valid.
7.32 WHEN a deployment explicitly configures a custom idle timeout THEN the system SHALL CONTINUE TO honor that configured value.

### 8. Missing null check after `resolveDbSiteId()` — `[CRITICAL][REPORTED]`

`lib/admin-guard.ts`. A missing null check after `resolveDbSiteId()` can cause DB
failures or an authorization bypass for static sites.

#### Current Behavior (Defect)

8.11 WHEN `resolveDbSiteId()` returns null/undefined (DB failure or a static site) THEN the system proceeds without a valid site id, risking a DB error or an authorization bypass.

#### Expected Behavior (Correct)

8.21 WHEN `resolveDbSiteId()` returns no site id THEN the system SHALL deny access (fail closed) and surface a clear error rather than proceeding.

#### Unchanged Behavior (Regression Prevention)

8.31 WHEN `resolveDbSiteId()` returns a valid site id for an authorized admin THEN the system SHALL CONTINUE TO grant access exactly as today.

### 9. `fetchStagingBytes` accepts 200 OK instead of requiring 206 — `[CRITICAL][REPORTED]`

`lib/r2.ts`. `fetchStagingBytes` accepts a 200 OK (fetching the entire file) instead of
strictly requiring 206 Partial Content, breaking the magic-byte check and risking memory
exhaustion.

#### Current Behavior (Defect)

9.11 WHEN the range request returns 200 OK instead of 206 Partial Content THEN the system fetches the entire file into memory, breaking the bounded magic-byte check and risking memory exhaustion.

#### Expected Behavior (Correct)

9.21 WHEN the range request does not return 206 Partial Content THEN the system SHALL reject the response (treat it as an error) rather than reading the full body.

#### Unchanged Behavior (Regression Prevention)

9.31 WHEN the server correctly returns 206 with the requested byte range THEN the system SHALL CONTINUE TO perform the magic-byte check on the bounded slice.

### 10. `AdminPayload` cast without field validation — `[HIGH][REPORTED]`

A direct cast to `AdminPayload` without validating fields could allow forged role claims.

#### Current Behavior (Defect)

10.11 WHEN an admin payload is constructed by casting untrusted data THEN the system accepts unvalidated fields, allowing a forged role claim to be trusted.

#### Expected Behavior (Correct)

10.21 WHEN an admin payload is constructed THEN the system SHALL validate required fields (including role) against an explicit schema before trusting them.

#### Unchanged Behavior (Regression Prevention)

10.31 WHEN a well-formed, legitimately-signed admin payload is provided THEN the system SHALL CONTINUE TO authorize the admin as today.

### 11. `RATE_LIMIT_FORCE_OPEN` bypasses rate limiting silently — `[HIGH][REPORTED]`

The `RATE_LIMIT_FORCE_OPEN` kill switch silently bypasses all rate limiting with no audit
log.

#### Current Behavior (Defect)

11.11 WHEN `RATE_LIMIT_FORCE_OPEN` is enabled THEN the system bypasses all rate limiting without emitting any audit log entry.

#### Expected Behavior (Correct)

11.21 WHEN `RATE_LIMIT_FORCE_OPEN` is enabled THEN the system SHALL emit an audit log / warning recording that rate limiting is disabled and for which scope.

#### Unchanged Behavior (Regression Prevention)

11.31 WHEN the kill switch is not enabled THEN the system SHALL CONTINUE TO enforce rate limiting as today.

### 12. `sanitizeHtml(null)` returns null instead of empty string — `[HIGH][REPORTED]`

`sanitizeHtml(null)` returns `null` instead of an empty string, sending a dangerous falsy
value into `dangerouslySetInnerHTML`.

#### Current Behavior (Defect)

12.11 WHEN `sanitizeHtml` is called with `null`/`undefined` THEN the system returns a falsy non-string value that can flow into `dangerouslySetInnerHTML`.

#### Expected Behavior (Correct)

12.21 WHEN `sanitizeHtml` is called with `null`/`undefined` THEN the system SHALL return an empty string (`""`).

#### Unchanged Behavior (Regression Prevention)

12.31 WHEN `sanitizeHtml` is called with a valid HTML string THEN the system SHALL CONTINUE TO return the same sanitized output as today.

### 13. CSRF timing-safe comparison result discarded — `[HIGH][REPORTED]`

`lib/csrf.ts`. The timing-safe comparison result is discarded (`void` result), so V8
dead-code-eliminates the comparison loop, restoring a timing side-channel.

#### Current Behavior (Defect)

13.11 WHEN the CSRF token comparison runs THEN the system discards the comparison result, allowing the engine to dead-code-eliminate the constant-time loop and reintroduce a timing side-channel.

#### Expected Behavior (Correct)

13.21 WHEN the CSRF token comparison runs THEN the system SHALL consume the comparison result so the constant-time comparison is preserved and used to accept/reject the token.

#### Unchanged Behavior (Regression Prevention)

13.31 WHEN a valid CSRF token is supplied THEN the system SHALL CONTINUE TO accept the request, and WHEN an invalid token is supplied THEN the system SHALL CONTINUE TO reject it.

### 14. Time-source confusion lets HMAC nonces never expire — `[HIGH][REPORTED]`

`performance.now()` is mixed with `Date.now()`, so internal HMAC nonces never expire.

#### Current Behavior (Defect)

14.11 WHEN nonce expiry is evaluated using a monotonic `performance.now()` value compared against wall-clock `Date.now()` timestamps THEN the system computes an incorrect elapsed time and the nonces effectively never expire.

#### Expected Behavior (Correct)

14.21 WHEN nonce expiry is evaluated THEN the system SHALL use a single consistent time source so nonces expire after their intended TTL.

#### Unchanged Behavior (Regression Prevention)

14.31 WHEN a nonce is used within its valid TTL THEN the system SHALL CONTINUE TO accept it.

---

## Domain C — E2E Test Suite

### 15. Auth storage-state may be committed / crashes on fresh clone — `[CRITICAL][REPORTED]`

`E2E-01`. `e2e/.auth/storage-state.json` may be committed (leaking browser cookies /
session tokens) and causes `ENOENT` crashes on fresh clones.

#### Current Behavior (Defect)

15.11 WHEN the auth storage-state file is committed THEN the system leaks browser cookies and session tokens into version control.
15.12 WHEN the file is absent on a fresh clone THEN the system crashes with `ENOENT` instead of generating or skipping gracefully.

#### Expected Behavior (Correct)

15.21 WHEN the repository is committed THEN the system SHALL exclude `e2e/.auth/storage-state.json` via `.gitignore` (and remove any tracked copy).
15.22 WHEN the file is absent THEN the system SHALL generate it (global setup) or skip dependent tests gracefully rather than crashing.

#### Unchanged Behavior (Regression Prevention)

15.31 WHEN a valid storage-state exists locally THEN the system SHALL CONTINUE TO reuse the authenticated session for E2E tests.

### 16. `quota-exhaustion.spec.ts` fires ~175 real live API calls per CI run — `[CRITICAL][REPORTED]`

`E2E-02`. The spec fires roughly 175 real live API calls per CI run (35 × 5 browser
projects) against `/api/gift-finder`, burning real quota.

#### Current Behavior (Defect)

16.11 WHEN the E2E suite runs in CI THEN the system issues ~175 real requests against the live `/api/gift-finder` endpoint, consuming real production/provider quota.

#### Expected Behavior (Correct)

16.21 WHEN the quota-exhaustion test runs THEN the system SHALL exercise the behavior against a mock/stub or restrict it to a single browser project so it does not burn real live quota.

#### Unchanged Behavior (Regression Prevention)

16.31 WHEN the test runs THEN the system SHALL CONTINUE TO validate quota-exhaustion handling behavior (the assertion coverage is preserved).

### 17. Missing `JWT_SECRET` crashes the whole Playwright worker — `[HIGH][REPORTED]`

`E2E-03`. A missing `JWT_SECRET` throws a hard worker crash that aborts the whole
Playwright process instead of skipping the affected test.

#### Current Behavior (Defect)

17.11 WHEN `JWT_SECRET` is missing THEN the system throws and aborts the entire Playwright process.

#### Expected Behavior (Correct)

17.21 WHEN `JWT_SECRET` is missing THEN the system SHALL skip the tests that require it (test-level skip) rather than aborting the whole run.

#### Unchanged Behavior (Regression Prevention)

17.31 WHEN `JWT_SECRET` is present THEN the system SHALL CONTINUE TO run the dependent tests normally.

### 18. Duplicated auth helpers copy-pasted across specs — `[HIGH][REPORTED]`

`E2E-04`. `isOnLoginPage` and `gotoAdminAndSettle` are copy-pasted into
`admin-content.spec.ts` and `admin-products.spec.ts` even though `e2e/helpers/` exists.

#### Current Behavior (Defect)

18.11 WHEN the admin specs need shared helpers THEN the system duplicates `isOnLoginPage` and `gotoAdminAndSettle` inline, risking divergence.

#### Expected Behavior (Correct)

18.21 WHEN the admin specs need shared helpers THEN the system SHALL import them from `e2e/helpers/` (single source of truth).

#### Unchanged Behavior (Regression Prevention)

18.31 WHEN the specs run THEN the system SHALL CONTINUE TO exhibit the same login/navigation behavior the helpers provide today.

### 19. "Redirect unauthenticated users" test passes trivially — `[HIGH][REPORTED]`

`E2E-05`. The test regex `/\/admin\/login|\/q7m-k4j9/` passes trivially when
authenticated (it matches the dashboard path), making the assertion useless.

#### Current Behavior (Defect)

19.11 WHEN the test runs in an authenticated context THEN the system's regex matches the dashboard URL and the assertion passes without verifying any redirect.

#### Expected Behavior (Correct)

19.21 WHEN verifying the unauthenticated redirect THEN the system SHALL assert against an unauthenticated context and match only the login destination, failing if no redirect occurs.

#### Unchanged Behavior (Regression Prevention)

19.31 WHEN an unauthenticated user actually hits a protected route THEN the system SHALL CONTINUE TO redirect to login.

### 20. Newsletter spec uses always-true visibility anti-pattern — `[HIGH][REPORTED]`

`E2E-06`. `newsletter-signup.spec.ts` uses `page.waitForTimeout(1000)` then
`body.isVisible()` (always-true anti-pattern).

#### Current Behavior (Defect)

20.11 WHEN the newsletter test asserts success THEN the system waits a fixed timeout then checks `body.isVisible()`, which is effectively always true and asserts nothing meaningful.

#### Expected Behavior (Correct)

20.21 WHEN the newsletter test asserts success THEN the system SHALL wait for a specific success indicator (locator/state) instead of a fixed timeout plus a vacuous visibility check.

#### Unchanged Behavior (Regression Prevention)

20.31 WHEN the newsletter signup succeeds THEN the system SHALL CONTINUE TO pass, and WHEN it fails THEN the test SHALL now correctly fail.

### 21. E2E suite robustness gaps (grouped) — `[MEDIUM/LOW][REPORTED]`

Lower-severity E2E hygiene findings.

#### Current Behavior (Defect)

21.11 WHEN global setup runs THEN the system relies on `networkidle`, which is flaky.
21.12 WHEN running accessibility coverage THEN the system contains duplicate axe specs.
21.13 WHEN an RTL test runs THEN the system targets the wrong tenant.
21.14 WHEN locating cookies THEN the system uses an over-broad cookie locator.
21.15 WHEN the error-boundary test runs THEN the system never actually reaches a boundary.
21.16 WHEN tests run THEN the system uses 100-tab parallelism.
21.17 WHEN webhook replay is tested THEN the system leaves replay assertions unimplemented.
21.18 WHEN search is tested THEN the system contains vacuous search assertions.
21.19 WHEN simulating `Set-Cookie` via a route mock THEN the system is unreliable.
21.20 WHEN `bypassCSP` is enabled THEN the system masks real CSP violations.
21.21 WHEN referencing the obscured admin route THEN the system hardcodes `/q7m-k4j9` in 5+ files.

#### Expected Behavior (Correct)

21.21e WHEN global setup runs THEN the system SHALL wait on deterministic conditions instead of `networkidle`.
21.22e WHEN running accessibility coverage THEN the system SHALL consolidate duplicate axe specs.
21.23e WHEN an RTL test runs THEN the system SHALL target the correct RTL tenant.
21.24e WHEN locating cookies THEN the system SHALL use a precise cookie locator.
21.25e WHEN testing the error boundary THEN the system SHALL trigger and assert an actual boundary render.
21.26e WHEN tests run THEN the system SHALL use a sane parallelism level.
21.27e WHEN webhook replay is tested THEN the system SHALL implement the replay assertions.
21.28e WHEN search is tested THEN the system SHALL assert meaningful results.
21.29e WHEN simulating `Set-Cookie` THEN the system SHALL use a reliable mechanism.
21.30e WHEN CSP is evaluated THEN the system SHALL not blanket-`bypassCSP`, allowing real violations to surface.
21.31e WHEN referencing the obscured admin route THEN the system SHALL source it from a single shared constant.

#### Unchanged Behavior (Regression Prevention)

21.31 WHEN the E2E suite runs after these changes THEN the system SHALL CONTINUE TO provide equivalent or better coverage for each affected scenario.

---

## Domain D — Config / Database Schema

### 22. `"compare"` homepage_template rejected by DB CHECK constraint — `[HIGH][VERIFIED]`

`config/site-definition.ts`, `config/define-site.ts`, and `config/sites/ai-compared.ts`
all use `"compare"` (homepage / layout / `homepageTemplate`), and
`app/(public)/components/homepage-compare.tsx` is actively rendered. **However**, the
CHECK constraint in `supabase/migrations/2026052701_site_templates_and_card_styles.sql`
only allows `('standard','cinematic','minimal','editorial','top10')` for both the `sites`
and `niche_templates` tables. Additionally, the `lib/dal/sites.ts` type and the admin
`site-form.tsx` options omit `"compare"`.

This was confirmed against the code: the type union includes `"compare"`, the
`ai-compared` site is defined with `homepage: "compare"`, and the migration constraint
does not list `'compare'`.

#### Current Behavior (Defect)

22.11 WHEN a fresh DB provision inserts the `ai-compared` site with `homepage_template = 'compare'` THEN the system raises a Postgres CHECK constraint violation and the insert fails.
22.12 WHEN an admin edits a site in `site-form.tsx` and selects/saves `"compare"` THEN the system rejects the value because the option is absent and the DB constraint forbids it.
22.13 WHEN `lib/dal/sites.ts` types the template field THEN the system omits `"compare"` from the allowed type, diverging from `config/site-definition.ts`.

#### Expected Behavior (Correct)

22.21 WHEN a site is provisioned or updated with `homepage_template = 'compare'` THEN the system SHALL accept it, via a new forward migration that extends the CHECK constraint on both `sites` and `niche_templates` to include `'compare'`.
22.22 WHEN `lib/dal/sites.ts` types the template field THEN the system SHALL include `'compare'` in the allowed type union.
22.23 WHEN an admin opens `site-form.tsx` THEN the system SHALL offer `"compare"` as a selectable homepage/layout option.

#### Unchanged Behavior (Regression Prevention)

22.31 WHEN a site uses one of the existing templates (`standard`, `cinematic`, `minimal`, `editorial`, `top10`) THEN the system SHALL CONTINUE TO accept and render it exactly as today.
22.32 WHEN the new migration is applied THEN the system SHALL CONTINUE TO preserve all existing rows and their current `homepage_template` / `product_card_style` values (forward-only, no data loss).

#### Bug Condition (formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SiteTemplateWrite   // insert or update of homepage_template
  OUTPUT: boolean

  // Bug triggers when the value is the valid app-level "compare" template
  // but the DB CHECK constraint / DAL type / admin form does not allow it.
  RETURN X.homepage_template = 'compare'
END FUNCTION
```

```pascal
// Property: Fix Checking — "compare" template accepted end-to-end
FOR ALL X WHERE isBugCondition(X) DO
  result ← writeSiteTemplate'(X)
  ASSERT result.succeeded = TRUE
    AND no_constraint_violation(result)
    AND admin_form_offers('compare')
    AND dal_type_includes('compare')
END FOR
```

```pascal
// Property: Preservation Checking — existing templates unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT writeSiteTemplate(X) = writeSiteTemplate'(X)
END FOR
```

---

## Domain E — `.github` CI/CD

### 23. Composite actions interpolate inputs inline into shell — `[HIGH][VERIFIED]`

`health-check/action.yml` and `smoke-test/action.yml` interpolate inputs inline into the
shell script (e.g. `CRON_SECRET="${{ inputs.cron-secret }}"`, `HOST="${{ inputs.host }}"`,
`IFS=',' read -ra PATHS <<< "${{ inputs.paths }}"`). Verified against both files. The
`smoke-test` host traces to a `workflow_dispatch` string input, making it a (write-gated)
command-injection vector. `smoke-test/action.yml` ALSO lacks `set -euo pipefail` (which
`health-check` has).

#### Current Behavior (Defect)

23.11 WHEN a composite action runs THEN the system substitutes `${{ inputs.* }}` directly into the shell script body, so a crafted input value can break out and execute arbitrary shell.
23.12 WHEN `smoke-test/action.yml` runs THEN the system runs without `set -euo pipefail`, so errors and unset variables do not fail the step.

#### Expected Behavior (Correct)

23.21 WHEN a composite action consumes an input THEN the system SHALL pass it through an `env:` block and reference it as `"$VAR"` inside the script (no inline `${{ }}` interpolation into the script body).
23.22 WHEN `smoke-test/action.yml` runs THEN the system SHALL set `set -euo pipefail` consistent with `health-check`.

#### Unchanged Behavior (Regression Prevention)

23.31 WHEN well-formed inputs are supplied THEN the system SHALL CONTINUE TO perform the same health-check and smoke-test logic and produce the same pass/fail outcomes.

### 24. Workflows missing `permissions:` block — `[HIGH][REPORTED]`

`rollback.yml`, `dr-drill.yml`, `load-test.yml`, and `backup-restore-drill.yml` set no
`permissions:` block and inherit the default `GITHUB_TOKEN` scope.

#### Current Behavior (Defect)

24.11 WHEN these four workflows run THEN the system grants them the default (broad) `GITHUB_TOKEN` permissions because no `permissions:` block is declared.

#### Expected Behavior (Correct)

24.21 WHEN these workflows run THEN the system SHALL declare a least-privilege `permissions:` block (`permissions: {}` or `contents: read`, widened only as each job requires).

#### Unchanged Behavior (Regression Prevention)

24.31 WHEN a workflow legitimately needs a scope THEN the system SHALL CONTINUE TO grant exactly that scope so the workflow still functions.

### 25. CODEOWNERS security-review boundary not enforced — `[HIGH][REPORTED]`

`rulesets/main-protection.json` sets `required_approving_review_count: 0` and
`require_code_owner_review: false`, so CODEOWNERS routing to `@groupsmix/security` is
documentation-only — yet `audit3-locks.test.ts` asserts file contents and passes,
creating false assurance.

#### Current Behavior (Defect)

25.11 WHEN a PR touches security-owned paths THEN the system does not require a security CODEOWNER review because the ruleset disables code-owner review and requires zero approvals.
25.12 WHEN `audit3-locks.test.ts` runs THEN the system passes by asserting file contents only, implying enforcement that does not exist.

#### Expected Behavior (Correct)

25.21 WHEN a PR touches security-owned paths THEN the system SHALL require a code-owner review (enable `require_code_owner_review` and a non-zero approval count in the ruleset).
25.22 WHEN the lock test runs THEN the system SHALL assert effective enforcement (ruleset settings), not just CODEOWNERS file contents.

#### Unchanged Behavior (Regression Prevention)

25.31 WHEN a PR does not touch security-owned paths THEN the system SHALL CONTINUE TO follow its existing review requirements.

### 26. "Preview E2E gate" rubber-stamps when previews are off — `[HIGH][REPORTED]`

`preview.yml` (~315-318). Preview deploys are gated behind
`vars.ENABLE_PREVIEW_DEPLOYS == 'true'` (off by default); when off, the gate sees skipped
results, emits `::warning::`, and exits 0.

#### Current Behavior (Defect)

26.11 WHEN `ENABLE_PREVIEW_DEPLOYS` is not `'true'` THEN the system treats the skipped E2E results as a pass, emits a warning, and exits 0 — the "gate" provides no protection.

#### Expected Behavior (Correct)

26.21 WHEN preview E2E results are required THEN the system SHALL distinguish "intentionally disabled" from "passed" and SHALL NOT report a green gate based on skipped results when the gate is supposed to be enforcing.

#### Unchanged Behavior (Regression Prevention)

26.31 WHEN previews are enabled and E2E passes THEN the system SHALL CONTINUE TO allow the deploy.

### 27. Post-deploy drift + smoke checks are log-only — `[HIGH][REPORTED]`

`deploy.yml`. Runtime drift (Worker secrets ~1791), cron schedules (~1830), and the
`e2e-smoke` job (~1886) are `continue-on-error` (log-only), so drift never turns the run
red.

#### Current Behavior (Defect)

27.11 WHEN post-deploy drift or smoke checks detect a problem THEN the system only logs it (`continue-on-error`) and the overall run stays green.

#### Expected Behavior (Correct)

27.21 WHEN a post-deploy drift or smoke check detects a real failure THEN the system SHALL fail the run (or surface a required, non-`continue-on-error` status) so regressions are visible.

#### Unchanged Behavior (Regression Prevention)

27.31 WHEN no drift or smoke failure is present THEN the system SHALL CONTINUE TO complete the deploy successfully.

### 28. CI/CD configuration accuracy gaps (grouped) — `[MEDIUM/LOW][REPORTED]`

Misleading labels, drift, and validation-strength issues.

#### Current Behavior (Defect)

28.11 WHEN pinned-SHA actions are referenced THEN the system has version-comment drift (same commit, different `# vX` comments across files for `actions/checkout`, `actions/setup-node`, `codeql-action`).
28.12 WHEN the required check named "npm audit (high / critical)" runs THEN the system actually runs `--audit-level=moderate` (`security.yml` ~79 vs ~96) — the gate label is misleading.
28.13 WHEN `run-migrations` "Dry-run validation" runs (`action.yml` ~64-76) THEN the system performs a keyword grep (`head -50 | grep -E '(CREATE|ALTER|...)'`), not syntax validation, so the step name oversells.
28.14 WHEN `load-test` runs THEN the system passes `target_url` (from `workflow_dispatch`/`workflow_call`) unvalidated to the load script, enabling SSRF/DoS from GitHub runners (write-gated).
28.15 WHEN build steps run `npm ci` (`deploy.yml` ~157/932/1897, `ci.yml` ~670) THEN the system does not pass `--ignore-scripts`, so a compromised dependency lifecycle script could run with whatever secrets are in the job env.

#### Expected Behavior (Correct)

28.21 WHEN pinned-SHA actions are referenced THEN the system SHALL use consistent version comments for the same commit across all files.
28.22 WHEN the npm-audit gate runs THEN the system SHALL either run at `--audit-level=high`/`critical` to match its name OR rename the check to reflect `moderate`.
28.23 WHEN migration validation runs THEN the system SHALL either perform real syntax validation OR rename the step to reflect that it is a keyword scan.
28.24 WHEN `load-test` receives `target_url` THEN the system SHALL validate it against an allowlist before use.
28.25 WHEN build steps run `npm ci` THEN the system SHALL pass `--ignore-scripts` where feasible AND/OR ensure deploy secrets are not present in the job env at install time (to be confirmed by the implementing agent).

#### Unchanged Behavior (Regression Prevention)

28.31 WHEN these workflows run after the changes THEN the system SHALL CONTINUE TO build, test, audit, migrate, and deploy successfully for legitimate inputs.

---

## Domain F — `.semgrep` Security Rules

### 29. `unsafe-redirect` rule has open-redirect blind spots and bypasses — `[HIGH][VERIFIED]`

Confirmed in `.semgrep/nextjs-security.yml`: the `unsafe-redirect` rule whitelists
`new URL(..., request.url)` (an open-redirect blind spot when the first arg is absolute)
and only matches the single-arg `NextResponse.redirect($URL)` form, so `redirect(url, 307)`,
`Response.redirect`, and `next/navigation` `redirect()` all bypass it.

#### Current Behavior (Defect)

29.11 WHEN a redirect uses `new URL(absoluteUrl, request.url)` THEN the system treats it as safe even though an absolute first argument produces an open redirect.
29.12 WHEN a redirect uses a second argument (`NextResponse.redirect(url, 307)`), or uses `Response.redirect`, or `next/navigation`'s `redirect()` THEN the system does not match and the redirect is unchecked.

#### Expected Behavior (Correct)

29.21 WHEN any redirect target is not validated by `safeRedirectUrl()` THEN the system SHALL flag it, including multi-arg `NextResponse.redirect(url, status)`, `Response.redirect`, and `next/navigation` `redirect()`.
29.22 WHEN a redirect uses `new URL(arg, request.url)` with a potentially-absolute first argument THEN the system SHALL NOT blanket-whitelist it as safe.

#### Unchanged Behavior (Regression Prevention)

29.31 WHEN a redirect target is validated via `safeRedirectUrl(...)` THEN the system SHALL CONTINUE TO treat it as safe (no false positive).

### 30. `admin-route-missing-auth` misses const/sync handlers and over-flags helpers — `[HIGH][VERIFIED]`

Confirmed: the rule only matches `export async function $METHOD`, so const-arrow handlers
(`export const GET = async () =>`) and sync handlers are unchecked; `$METHOD` is
unconstrained, so non-handler exported async helpers get false-positive flagged.

#### Current Behavior (Defect)

30.11 WHEN an admin route exports a `const` arrow handler or a synchronous handler THEN the system does not check it for an authz guard.
30.12 WHEN an admin route file exports an unrelated `export async function` helper THEN the system false-positively flags it because `$METHOD` is unconstrained.

#### Expected Behavior (Correct)

30.21 WHEN the rule matches a handler name THEN the system SHALL constrain `$METHOD` with a metavariable-regex `^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$` so only real handlers are matched.
30.22 WHEN an admin route exports a `const` handler THEN the system SHALL have a companion rule that flags const handlers not wrapped in `withAuthz(...)`.

#### Unchanged Behavior (Regression Prevention)

30.31 WHEN an `export async function GET/POST/...` handler calls an approved guard (`requireAdmin`/`requireSuperAdmin`/`requireAdminSession`) THEN the system SHALL CONTINUE TO treat it as safe.

### 31. `service-role-import` is bypassable, noisy, and only WARNING — `[HIGH][VERIFIED]`

Confirmed: the rule only matches named imports (namespace/default/`require`/dynamic-import
bypass), is `WARNING` not `ERROR`, and also fires on legitimately allowlisted imports
(noise).

#### Current Behavior (Defect)

31.11 WHEN the service-role client is imported via namespace import, default import, `require`, or dynamic `import()` THEN the system does not match it.
31.12 WHEN the rule matches THEN the system reports `WARNING` severity rather than `ERROR`.
31.13 WHEN a legitimately allowlisted file imports the service-role client THEN the system still fires, producing noise.

#### Expected Behavior (Correct)

31.21 WHEN the service-role client is imported by any mechanism (named, namespace, default, `require`, dynamic import) THEN the system SHALL flag it.
31.22 WHEN the rule fires on a non-allowlisted import THEN the system SHALL report it at `ERROR` severity.
31.23 WHEN a file is on the service-role allowlist THEN the system SHALL NOT flag it (suppress allowlisted imports).

#### Unchanged Behavior (Regression Prevention)

31.31 WHEN an allowlisted, reviewed import is present THEN the system SHALL CONTINUE TO permit it without error.

### 32. Rules hardcode `request` var name, literal header case, and narrow path scope — `[MEDIUM][VERIFIED]`

Confirmed: rules hardcode the variable name `request` (should use a `$REQ` metavariable)
and the literal lowercase `"x-forwarded-for"` (should be case-insensitive); path scope
only covers `app/api/admin/**`.

#### Current Behavior (Defect)

32.11 WHEN a handler names its request parameter something other than `request` THEN the system fails to match the raw-IP-header rule.
32.12 WHEN code reads the header with different casing (e.g. `X-Forwarded-For`) THEN the system does not match the literal lowercase pattern.
32.13 WHEN unsafe patterns appear under cron/internal/server-action paths THEN the system does not scan them (path scope is only `app/api/admin/**`).

#### Expected Behavior (Correct)

32.21 WHEN matching the request object THEN the system SHALL use a `$REQ` metavariable rather than the literal `request`.
32.22 WHEN matching the forwarded-for header THEN the system SHALL match case-insensitively.
32.23 WHEN choosing scan scope THEN the system SHALL consider including cron/internal/server-action paths.

#### Unchanged Behavior (Regression Prevention)

32.31 WHEN existing admin-route violations are present THEN the system SHALL CONTINUE TO detect them after the generalization.

---

## Domain G — Root `app/` Files

### 33. `globals.css` token conflict silently breaks dark-mode `--primary` — `[HIGH][REPORTED]`

`globals.css`. The `@theme inline` block (~L92-131) maps `--color-primary` to shadcn's
`--primary`, but a second `:root` block (~L138-146) overwrites `--color-primary` with
`#1e293b`, silently breaking dark-mode `--primary` for Tailwind utilities that use
`--color-primary`.

#### Current Behavior (Defect)

33.11 WHEN a Tailwind utility resolves `--color-primary` THEN the system uses the hardcoded `#1e293b` from the second `:root` block, breaking the intended dark-mode `--primary` mapping.

#### Expected Behavior (Correct)

33.21 WHEN `--color-primary` is resolved THEN the system SHALL map it to the shadcn `--primary` token consistently in both light and dark modes (remove or reconcile the conflicting override).

#### Unchanged Behavior (Regression Prevention)

33.31 WHEN light-mode primary styling is resolved THEN the system SHALL CONTINUE TO render the intended primary color.

### 34. Icon routes query the DB twice and lack `Cache-Control` — `[MEDIUM][REPORTED]`

`apple-icon.tsx` & `icon.tsx`. `resolveDbSiteBySlug(site.id)` is called twice and there is
no `Cache-Control` header on the custom favicon, causing redundant DB queries.

#### Current Behavior (Defect)

34.11 WHEN an icon route renders THEN the system calls `resolveDbSiteBySlug(site.id)` twice and returns the favicon without a `Cache-Control` header, so every request re-queries the DB.

#### Expected Behavior (Correct)

34.21 WHEN an icon route renders THEN the system SHALL resolve the site once and SHALL set an appropriate `Cache-Control` header on the favicon response.

#### Unchanged Behavior (Regression Prevention)

34.31 WHEN the icon route renders THEN the system SHALL CONTINUE TO return the correct per-site icon.

### 35. `sitemap.ts` falls back to `new Date()` for `lastmod` — `[MEDIUM][REPORTED]`

`sitemap.ts` (~L224/245). `updated_at` falls back to `new Date()`, so crawlers always see
"just now".

#### Current Behavior (Defect)

35.11 WHEN a row has no `updated_at` THEN the system emits `new Date()` as `lastmod`, making every sitemap entry appear freshly modified on each generation.

#### Expected Behavior (Correct)

35.21 WHEN a row has no `updated_at` THEN the system SHALL fall back to a `STATIC_LAST_MODIFIED` constant or the row's `created_at`, producing a stable `lastmod`.

#### Unchanged Behavior (Regression Prevention)

35.31 WHEN a row has a real `updated_at` THEN the system SHALL CONTINUE TO emit that timestamp.

### 36. Obscured admin route hardcoded in a client component — `[MEDIUM][REPORTED]`

`layout.tsx` (~L117). The obscured admin route `"/q7m-k4j9"` is hardcoded in a client
component, so it leaks into the client bundle.

#### Current Behavior (Defect)

36.11 WHEN the client bundle is built THEN the system embeds the obscured admin route string `"/q7m-k4j9"`, leaking it to anyone inspecting the bundle.

#### Expected Behavior (Correct)

36.21 WHEN the admin route is referenced THEN the system SHALL source it from an env var / server-only constant so it does not ship in the client bundle.

#### Unchanged Behavior (Regression Prevention)

36.31 WHEN an authorized admin navigates THEN the system SHALL CONTINUE TO route to the admin area correctly.

### 37. `error.tsx` & `not-found.tsx` lack dark-mode variants — `[LOW][REPORTED]`

Hardcoded light colors (`text-gray-900`, `bg-red-100`) with no dark-mode variants.

#### Current Behavior (Defect)

37.11 WHEN the error or not-found page renders in dark mode THEN the system shows hardcoded light colors with no dark-mode variant, producing poor contrast.

#### Expected Behavior (Correct)

37.21 WHEN these pages render THEN the system SHALL provide dark-mode color variants.

#### Unchanged Behavior (Regression Prevention)

37.31 WHEN these pages render in light mode THEN the system SHALL CONTINUE TO appear as today.

---

## Domain H — `config/` Builders

### 38. `defineSite()` mutates the caller's `features` input — `[LOW][VERIFIED]`

`config/define-site.ts`. When `homepage !== "standard"`, the code assigns
`features.customHomepage = true` on the resolved `features` object. When the caller passes
`featureFlags`, that object is used directly, so the caller's input is mutated.

#### Current Behavior (Defect)

38.11 WHEN `defineSite` is called with an explicit `featureFlags` object and a non-standard homepage THEN the system mutates that caller-owned object by setting `customHomepage = true`.

#### Expected Behavior (Correct)

38.21 WHEN `defineSite` derives features THEN the system SHALL operate on a copy so the caller's input object is not mutated.

#### Unchanged Behavior (Regression Prevention)

38.31 WHEN `defineSite` returns a `SiteDefinition` THEN the system SHALL CONTINUE TO set `customHomepage = true` on the returned definition for non-standard homepages.

### 39. `generateFooterNav` reads raw input features instead of resolved features — `[LOW][VERIFIED]`

`generateFooterNav` evaluates active features from raw `input.featureFlags` /
`input.features` instead of the resolved `features` object (fragile if defaults change).

#### Current Behavior (Defect)

39.11 WHEN `generateFooterNav` decides whether to show the Gift Finder link THEN the system reads `input.featureFlags?.giftFinder || input.features?.includes("giftFinder")` rather than the resolved `features` object, so default-derived features are not reflected.

#### Expected Behavior (Correct)

39.21 WHEN `generateFooterNav` evaluates active features THEN the system SHALL read the resolved `features` object so behavior stays correct if defaults change.

#### Unchanged Behavior (Regression Prevention)

39.31 WHEN the input explicitly enables Gift Finder THEN the system SHALL CONTINUE TO render the Gift Finder footer link.

---

## Domain I — `scripts/`

### 40. `validate-cloudflare-bindings.sh` validates nothing — `[HIGH][REPORTED]`

`SCRIPTS-01`. The `REQUIRED_SECRETS` loop is empty (only echoes "checking..."), so a
missing secret fails silently at deploy.

#### Current Behavior (Defect)

40.11 WHEN the binding validation script runs THEN the system only echoes "checking..." and never actually verifies any required secret, so a missing secret passes validation and fails later at deploy.

#### Expected Behavior (Correct)

40.21 WHEN the binding validation script runs THEN the system SHALL iterate the required secrets, assert each is present, and exit non-zero if any is missing.

#### Unchanged Behavior (Regression Prevention)

40.31 WHEN all required secrets are present THEN the system SHALL CONTINUE TO pass validation.

### 41. `rotate-cron-secrets.sh` leaves phase inconsistent on mid-loop failure — `[MEDIUM][REPORTED]`

`ROTATION_PHASE` is set to `"main-done"` only after the loop; a mid-loop failure under
`set -e` leaves the phase at `"pre"`, and the error trap suppresses the partial-rotation
warning.

#### Current Behavior (Defect)

41.11 WHEN rotation fails partway through the loop THEN the system leaves `ROTATION_PHASE` at `"pre"` (despite partial rotation) and the error trap suppresses the partial-rotation warning.

#### Expected Behavior (Correct)

41.21 WHEN rotation fails partway THEN the system SHALL record an accurate phase reflecting partial rotation AND SHALL surface the partial-rotation warning.

#### Unchanged Behavior (Regression Prevention)

41.31 WHEN rotation completes fully THEN the system SHALL CONTINUE TO set the phase to `"main-done"`.

### 42. `pause-site.ts` fragile regex edit; `check-admin-authz.sh` hardcoded allowlist — `[LOW][REPORTED]`

#### Current Behavior (Defect)

42.11 WHEN `pause-site.ts` updates `config/sites/index.ts` THEN the system uses a fragile regex search-and-replace that can break on formatting changes.
42.12 WHEN `check-admin-authz.sh` runs THEN the system relies on a hardcoded allowlist array that can drift.

#### Expected Behavior (Correct)

42.21 WHEN `pause-site.ts` edits the sites index THEN the system SHALL use a more robust edit (e.g. AST or structured update) resilient to formatting.
42.22 WHEN `check-admin-authz.sh` runs THEN the system SHALL derive its allowlist from a single maintained source rather than a hardcoded array.

#### Unchanged Behavior (Regression Prevention)

42.31 WHEN the scripts run against well-formed input THEN the system SHALL CONTINUE TO produce the same correct result.

---

## Domain J — `workers/`

### 43. Verify `withSentry` instruments the fetch handler — `[MEDIUM][REPORTED]`

`custom-worker.ts`. Confirm `withSentry` actually instruments the fetch handler (not
skipped).

#### Current Behavior (Defect)

43.11 WHEN the worker handles a fetch THEN the system may not be instrumented by `withSentry` (instrumentation may be skipped) — to be confirmed.

#### Expected Behavior (Correct)

43.21 WHEN the worker handles a fetch THEN the system SHALL be wrapped by `withSentry` so errors and traces are captured.

#### Unchanged Behavior (Regression Prevention)

43.31 WHEN the worker handles a request THEN the system SHALL CONTINUE TO return the same responses regardless of instrumentation.

### 44. `log-shipper` weak randomness and incomplete SSRF blocklist — `[LOW][REPORTED]`

`log-shipper/index.ts`. Uses `Math.random()` for the R2 key suffix (~32-bit); the SSRF
blocklist misses `fe80::` (link-local IPv6), `fc::` (ULA), and IPv4-mapped IPv6.

#### Current Behavior (Defect)

44.11 WHEN an R2 key suffix is generated THEN the system uses `Math.random()` (~32-bit), risking collisions.
44.12 WHEN the SSRF blocklist is evaluated THEN the system misses `fe80::` link-local IPv6, `fc::` ULA, and IPv4-mapped IPv6 ranges.

#### Expected Behavior (Correct)

44.21 WHEN an R2 key suffix is generated THEN the system SHALL use `crypto.getRandomValues()`.
44.22 WHEN the SSRF blocklist is evaluated THEN the system SHALL block `fe80::`, `fc::`, and IPv4-mapped IPv6 ranges.

#### Unchanged Behavior (Regression Prevention)

44.31 WHEN a legitimate (non-blocked) target is used THEN the system SHALL CONTINUE TO allow it.

### 45. `rate-limiter-do` double read; `heavy-crons` unsigned cron dispatch — `[LOW][REPORTED]`

#### Current Behavior (Defect)

45.11 WHEN `rate-limiter-do.ts` runs its critical section THEN the system performs two sequential `storage.get()` calls.
45.12 WHEN `heavy-crons.ts` dispatches a cron THEN the system uses a plain Bearer token (no HMAC signing like `custom-worker.ts`), making it replay-susceptible.

#### Expected Behavior (Correct)

45.21 WHEN the rate-limiter critical section reads storage THEN the system SHALL combine the reads into one multi-key read.
45.22 WHEN `heavy-crons.ts` dispatches a cron THEN the system SHALL HMAC-sign the request consistent with `custom-worker.ts`.

#### Unchanged Behavior (Regression Prevention)

45.31 WHEN rate limiting and cron dispatch run THEN the system SHALL CONTINUE TO produce the same functional outcomes for legitimate traffic.

---

## Domain K — `types/` & Test Coverage

### 46. Dead / duplicated row types in `types/database.ts` — `[LOW][REPORTED]`

`AdminSiteMembershipRow` is defined-but-not-exported while a duplicate exported version
lives in `lib/dal/admin-site-memberships.ts`; several row types
(`NewsletterSubscriberRow`, `RolePermissionRow`, `AdImpressionRow`, `WebVitalRow`) are
defined but unexported/unused.

#### Current Behavior (Defect)

46.11 WHEN `types/database.ts` is consulted THEN the system contains a non-exported `AdminSiteMembershipRow` duplicated by an exported version in `lib/dal/admin-site-memberships.ts`, plus several defined-but-unused row types.

#### Expected Behavior (Correct)

46.21 WHEN row types are defined THEN the system SHALL have a single exported source of truth per row type and SHALL remove or export the unused types intentionally.

#### Unchanged Behavior (Regression Prevention)

46.31 WHEN existing code references the currently-exported row types THEN the system SHALL CONTINUE TO compile and behave the same.

### 47. Low coverage thresholds and excluded integration tests — `[LOW][REPORTED]`

Very low global thresholds (24% statements / 20% branches); integration tests are excluded
from the default run.

#### Current Behavior (Defect)

47.11 WHEN coverage gates run THEN the system enforces only 24% statements / 20% branches, providing weak protection.
47.12 WHEN the default test run executes THEN the system excludes integration tests (unclear whether `test:integration` is a required CI status check).
47.13 WHEN the migration duplicate-prefix test runs THEN the system lacks an explicit allowed-collision whitelist.

#### Expected Behavior (Correct)

47.21 WHEN coverage gates run THEN the system SHALL raise thresholds toward a meaningful target.
47.22 WHEN integration tests are excluded from the default run THEN the system SHALL ensure `test:integration` is a required CI status check (to be confirmed by the implementing agent).
47.23 WHEN the migration duplicate-prefix test runs THEN the system SHALL define an explicit allowed-collision whitelist.

#### Unchanged Behavior (Regression Prevention)

47.31 WHEN the test suite runs THEN the system SHALL CONTINUE TO pass for the currently-passing tests.

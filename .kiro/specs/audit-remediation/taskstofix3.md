# Tasks to Fix — Batch 3: P3 Hygiene
# App bugs, E2E reliability, Docker, Workers, Types, Scripts, CI labels

Low-risk, high-clarity. No blocking security impact but each item produces misleading
signals or creates future bugs. Complete Batches 1 and 2 first.

---

## Task L — Fix CSS design-token cascade conflict (APP-1)

**File:** `app/globals.css` lines ~92–131 vs ~138–146
**Risk:** `--color-primary` defined twice — `@theme inline` maps it to `var(--primary)`,
a later `:root` block hardcodes `#1e293b`. Second block wins, breaking dark-mode primary.

### Steps
- [ ] L.1 Read `app/globals.css` — confirm both definitions.
- [ ] L.2 Remove `--color-primary: #1e293b` from the `:root` block. If the block is empty
  after, remove the whole block.
- [ ] L.3 Search `grep -r "var(--color-primary)" app/` — verify remaining references resolve correctly.
- [ ] L.4 `npm run build` — pass. Visual smoke: primary button colour looks correct.

---

## Task LL — Fix double DB call in favicon handlers (APP-2 perf)

**Files:** `app/apple-icon.tsx`, `app/icon.tsx`
**Risk:** `resolveDbSiteBySlug(site.id)` is called twice per request. No `Cache-Control`
header is emitted, so every request re-fetches.

### Steps
- [ ] LL.1 Read both files — find the duplicate `resolveDbSiteBySlug` calls.
- [ ] LL.2 Assign the result to a variable once and reuse it.
- [ ] LL.3 Add a `Cache-Control` header to the response:
  ```ts
  response.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  ```
- [ ] LL.4 `npm run typecheck` — pass.

---

## Task LM — Fix sitemap `new Date()` fallback (APP-4)

**File:** `app/sitemap.ts` lines ~224, ~245
**Risk:** Items with null `updated_at` emit `lastModified: new Date()` (always "just now"),
wasting search engine crawl budget.

### Steps
- [ ] LM.1 Confirm `STATIC_LAST_MODIFIED = new Date("2026-04-01T00:00:00Z")` exists at top
  of file. Add it if missing.
- [ ] LM.2 For content items and custom pages, change:
  ```ts
  lastModified: item.updated_at ? new Date(item.updated_at) : new Date()
  ```
  to:
  ```ts
  lastModified: item.updated_at
    ? new Date(item.updated_at)
    : item.created_at
    ? new Date(item.created_at)
    : STATIC_LAST_MODIFIED,
  ```
- [ ] LM.3 `npm run typecheck` — pass.

---

## Task LN — Move hardcoded admin path to env-backed constant (APP-3)

**File:** `app/layout.tsx` line ~117
**Risk:** `/q7m-k4j9` hardcoded in source — appears in version-controlled bundle, undermining
the security-by-obscurity value of the obfuscation.

### Steps
- [ ] LN.1 Create `lib/server-only/admin-path.ts`:
  ```ts
  import "server-only";
  export const ADMIN_PATH_SEGMENT = process.env.ADMIN_PATH_SEGMENT ?? "/q7m-k4j9";
  ```
- [ ] LN.2 Update `app/layout.tsx` to import and use `ADMIN_PATH_SEGMENT`.
- [ ] LN.3 Add `ADMIN_PATH_SEGMENT=/q7m-k4j9` to `.env.example` and `.dev.vars.example`.
- [ ] LN.4 Search `grep -rn "q7m-k4j9" app/ lib/ config/` — update all server-side usages
  to the constant. E2E test files may keep the literal.
- [ ] LN.5 `npm run typecheck` — pass.

---

## Task LO — Add dark mode to error and not-found pages (APP-5)

**Files:** `app/error.tsx`, `app/not-found.tsx`
**Risk (low):** Hardcoded light colours (`text-gray-900`, `bg-red-100`) cause jarring
contrast for dark-mode users.

### Steps
- [ ] LO.1 Read `app/error.tsx` and `app/not-found.tsx` — find all hardcoded colour classes.
- [ ] LO.2 Add corresponding `dark:` variants:
  - `text-gray-900` → `text-gray-900 dark:text-gray-100`
  - `bg-red-100` → `bg-red-100 dark:bg-red-900`
  - Apply to all other hardcoded colour classes in both files.
- [ ] LO.3 `npm run build` — pass.

---

## Task LP — Fix `defineSite` argument mutation (DB-2)

**File:** `config/define-site.ts`
**Risk:** The function may mutate the `features` input object directly, causing unexpected
side-effects when the configuration object is reused in tests.

### Steps
- [ ] LP.1 Read `config/define-site.ts` — find every place `features` or `input.featureFlags`
  is assigned to without first creating a shallow copy.
- [ ] LP.2 Replace mutations with immutable patterns:
  ```ts
  // Instead of:  features.customHomepage = true
  // Use:         features = { ...features, customHomepage: true }
  ```
- [ ] LP.3 Ensure `expandFeatures()` creates a new object rather than modifying its input.
- [ ] LP.4 Fix `generateFooterNav` to read from the **resolved** `features` object rather
  than from raw `input.featureFlags` / `input.features` directly.
- [ ] LP.5 `npm run typecheck` and `npx vitest run` — both pass.

---

## Task M — Fix E2E redirect assertion regex (E2E-05)

**Files:** `e2e/admin-products.spec.ts` line 38, `e2e/admin-content.spec.ts` line 41
**Risk:** Regex `/\/admin\/login|\/q7m-k4j9/` passes trivially when already on the dashboard.

### Steps
- [ ] M.1 Change to: `await expect(page).toHaveURL(/\/q7m-k4j9\/login/);`
- [ ] M.2 Confirm no other assertion in those specs depends on the broader regex.

---

## Task MM — Change JWT_SECRET missing from hard crash to test skip (E2E-03)

**Files:** `e2e/admin-site-manager-delete.spec.ts` line 33, `e2e/admin-login.spec.ts` line 10
**Risk:** Hard `throw` aborts the entire Playwright process, not just the spec.

### Steps
- [ ] MM.1 Replace `throw new Error("JWT_SECRET must be set...")` with:
  ```ts
  test.beforeAll(() => {
    if (!process.env.JWT_SECRET) {
      test.skip(true, "JWT_SECRET not set — skipping");
    }
  });
  ```
- [ ] MM.2 Apply to both files. `npm run typecheck` — pass.

---

## Task MN — Guard quota-exhaustion spec against live API calls (E2E-02)

**File:** `e2e/quota-exhaustion.spec.ts`
**Risk:** Gift-finder test fires real HTTP calls on every CI run, burning AI quota.

### Steps
- [ ] MN.1 Add skip guard or (preferred) mock `/api/gift-finder` with `page.route(...)`.
- [ ] MN.2 Add `ENABLE_QUOTA_E2E=false` to `.env.example`.

---

## Task MO — Deduplicate copy-pasted E2E helpers (E2E-04)

**Files:** `e2e/admin-content.spec.ts`, `e2e/admin-products.spec.ts`, `e2e/helpers/`
**Risk (maintenance):** `isOnLoginPage` and `gotoAdminAndSettle` are copy-pasted verbatim
into both spec files when `e2e/helpers/` exists for exactly this.

### Steps
- [ ] MO.1 Confirm the helpers already exist in `e2e/helpers/` (or that `is-login-page.ts`
  was created by the audit-fix-verification spec).
- [ ] MO.2 Remove the inline copies from `admin-content.spec.ts` and `admin-products.spec.ts`.
- [ ] MO.3 Import from `e2e/helpers/` in both files.
- [ ] MO.4 `npx playwright test admin-content admin-products` — pass.

---

## Task MP — Fix newsletter-signup hardcoded sleep (E2E-06)

**File:** `e2e/newsletter-signup.spec.ts`
**Risk:** `page.waitForTimeout(1000)` followed by `body.isVisible()` is an always-true
anti-pattern that makes the test slow and meaningless.

### Steps
- [ ] MP.1 Read the test — understand what it is actually waiting for.
- [ ] MP.2 Replace `waitForTimeout(1000)` with a deterministic wait:
  ```ts
  await page.waitForSelector("[data-testid='success-message']", { state: "visible" });
  ```
  Use the actual selector or network idle pattern appropriate for the signup response.
- [ ] MP.3 Remove the `body.isVisible()` assertion (it is always true).
- [ ] MP.4 `npx playwright test newsletter-signup` — pass.

---

## Task N — Fix SHA pin version-comment drift (GH-6)

**Files:** `rollback.yml`, `dr-drill.yml`, `load-test.yml`, `backup-restore-drill.yml`,
`deploy-gradual.yml`, `admin-bootstrap.yml`

### Steps
- [ ] N.1 `grep -rn "# v4" .github/` — find all stale `# v4` comments on pinned action lines.
- [ ] N.2 Update `actions/checkout@9c091bb...` lines from `# v4` to `# v7.0.0`.
- [ ] N.3 Update `actions/setup-node` and `codeql-action` comment tags to match their actual
  pinned SHA tags.
- [ ] N.4 Verify with `grep -rn "# v[0-9]" .github/` that no remaining drift exists.

---

## Task O — Fix npm-audit job name vs actual audit level (GH-7)

**Files:** `.github/workflows/security.yml`, `.github/rulesets/main-protection.json`

### Steps
- [ ] O.1 Update job `name:` in `security.yml` from `npm audit (high / critical)` to
  `npm audit (moderate+)`.
- [ ] O.2 Update the matching `context` in `main-protection.json` to `"npm audit (moderate+)"`.
  **These must match exactly** or the required-status-check binding breaks.
- [ ] O.3 `actionlint` — pass.

---

## Task P — Fix `validate-cloudflare-bindings.sh` empty loop (SCRIPT-01)

**File:** `scripts/validate-cloudflare-bindings.sh` lines ~66–81

### Steps
- [ ] P.1 Replace echo-only loop body with actual existence checks:
  ```bash
  VALIDATION_FAILED=0
  for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret:-}" ]; then
      echo "::error::Required secret '$secret' is not set"
      VALIDATION_FAILED=1
    else
      echo "  $secret: OK"
    fi
  done
  [ "$VALIDATION_FAILED" = "0" ] || exit 1
  ```
- [ ] P.2 Ensure `set -euo pipefail` is at the top of the script.
- [ ] P.3 Test: unset one secret, run the script — must exit 1.

---

## Task Q — Docker local dev hardening (DOCKER-03/04/05)

**File:** `docker-compose.yml`, `docker/kong.yml`

### Steps
- [ ] Q.1 **DOCKER-03 Kong:** Remove `key-auth` from `KONG_PLUGINS` and the `keyauth_credentials`
  consumer block (it's declared but explicitly ignored — remove the false signal).
- [ ] Q.2 **DOCKER-04 MinIO:** Change to env-var references with defaults:
  ```yaml
  MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
  MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
  ```
  Add both to `.env.local.example`.
- [ ] Q.3 **DOCKER-05 PostgREST:** Create a `pgrst_role` in local init SQL with only
  `CONNECT`, schema `USAGE`, and table-level DML — not `SUPERUSER`. Update `PGRST_DB_URI`
  to use the new role.
- [ ] Q.4 `docker compose --env-file .env.local up -d` — confirm local dev still works.

---

## Task R — Fix `lib/r2.ts` accepting 200 instead of requiring 206 (LIB-3)

**File:** `lib/r2.ts` `fetchStagingBytes`

### Steps
- [ ] R.1 Change the status check to strictly require 206:
  ```ts
  if (res.status !== 206) {
    throw new Error(`Expected 206 from R2 staging, got ${res.status}`);
  }
  ```
- [ ] R.2 Verify no caller depends on 200 acceptance. `npm run typecheck` — pass.

---

## Task S — Fix Workers security items

**Files:** `workers/log-shipper/index.ts`, `workers/rate-limiter-do.ts`, `workers/heavy-crons.ts`

### Steps
- [ ] S.1 **Math.random() R2 key** (`log-shipper/index.ts`): Replace `Math.random()` suffix
  with `crypto.getRandomValues(new Uint8Array(16))` converted to hex.
- [ ] S.2 **SSRF blocklist gaps** (`log-shipper/index.ts`): Add `fe80::` (link-local IPv6),
  `fc00::/7` (ULA), and `::ffff:0:0/96` (IPv4-mapped IPv6) to the SSRF blocklist.
- [ ] S.3 **Sequential storage reads** (`rate-limiter-do.ts`): Replace two sequential
  `storage.get()` calls in the critical section with a single multi-key read:
  ```ts
  const values = await storage.get(["key1", "key2"]);
  ```
- [ ] S.4 **heavy-crons HMAC** (`heavy-crons.ts`): Add HMAC signing to cron dispatch
  requests matching the pattern already used in `custom-worker.ts`. Do not dispatch with
  a plain Bearer token.
- [ ] S.5 `npm run typecheck` — pass.

---

## Task SS — Verify Sentry instrumentation in `custom-worker.ts`

**File:** `workers/custom-worker.ts`
**Risk (Medium):** `withSentry` wraps the exported worker — confirm that `handler.fetch`
(not a stale closure) is what the SDK instruments.

### Steps
- [ ] SS.1 Read `workers/custom-worker.ts` — find the `withSentry` wrapper.
- [ ] SS.2 Confirm `withSentry` receives the `fetch` handler, not a pre-bound version that
  bypasses the SDK's instrumentation.
- [ ] SS.3 If the SDK is receiving a stale closure, restructure so the live `handler.fetch`
  reference is passed.
- [ ] SS.4 Add a comment documenting the instrumentation chain for future maintainers.

---

## Task T — Fix duplicate and dead types (TYPES-1 + TYPES-2)

**Files:** `types/database.ts`, `lib/dal/admin-site-memberships.ts`

### Steps
- [ ] T.1 **Duplicate `AdminSiteMembershipRow`:** Either export the one in `types/database.ts`
  and remove the copy in `lib/dal/admin-site-memberships.ts`, or keep only the DAL version
  and delete the unexported one in `types/database.ts`. Update imports.
- [ ] T.2 **Dead types:** Remove or export `NewsletterSubscriberRow`, `RolePermissionRow`,
  `AdImpressionRow`, and `WebVitalRow` from `types/database.ts` — if they're unused,
  delete them; if they're needed elsewhere, export them and wire them in.
- [ ] T.3 `npm run typecheck` — pass.

---

## Task U — Fix test config gaps

**Files:** `vitest.config.ts` (or `vitest.config.js`), CI workflow files

### Steps
- [ ] U.1 **Coverage thresholds:** Read `vitest.config.ts` — find the global thresholds
  (currently 24% statements, 20% branches). Raise global minimums or add per-directory
  thresholds for any directories currently at 0% with no gate.
- [ ] U.2 **Integration tests in CI:** Confirm `test:integration` is a required status check
  in `.github/rulesets/main-protection.json`. If not, either add it or document explicitly
  why integration tests are excluded from the required gate.
- [ ] U.3 **Migration duplicate prefix whitelist:** Read the migration duplicate-prefix test —
  add an explicit whitelist of any known-allowed collisions as a named constant rather than
  an implicit regex exclusion.

---

## Task V — Fix `pause-site.ts` regex fragility (SCRIPT-LOW-1)

**File:** `scripts/pause-site.ts` (or wherever the regex search-and-replace runs)
**Risk (low):** Modifies TypeScript config files using raw regex — fragile if file formatting changes.

### Steps
- [ ] V.1 Read the script — find the regex-based file modification.
- [ ] V.2 Replace the raw regex with a proper AST-based transform using `ts-morph` or a
  simple string-split-on-known-token approach that is resilient to whitespace changes.
- [ ] V.3 Add a test that runs the script against a fixture `config/sites/index.ts` and
  asserts the output is syntactically valid TypeScript.

---

## Task W — Fix `check-admin-authz.sh` static file allowlist (SCRIPT-LOW-2)

**File:** `scripts/check-admin-authz.sh`
**Risk (low):** Hardcoded file array for exempted un-guarded routes will silently stop
working when new routes are added.

### Steps
- [ ] W.1 Read the script — find the hardcoded exemption array.
- [ ] W.2 Replace with a dynamic discovery approach (e.g., read exemptions from a JSON
  file that is also checked in) or add a CI-visible comment directing maintainers to
  update the array when adding new routes.
- [ ] W.3 Add a test that runs the script against the current codebase and asserts it exits 0.

---

## Final completion check (all three batches)

- [ ] `npm run typecheck` — exit 0
- [ ] `npx vitest run` — all green
- [ ] `npm run build` — no errors
- [ ] `npx semgrep --validate --config .semgrep/` — pass
- [ ] `npx semgrep --test --config .semgrep/` — all fixtures pass
- [ ] `actionlint` on changed workflow/action files — pass
- [ ] `npx playwright test --list` — no spec hard-crashes

---

## Full task index across all three batches

| Task | File(s) | Audit ref | Priority |
|---|---|---|---|
| A | `lib/admin-guard.ts` | LIB-2 | P1 |
| B | `lib/sanitize-html.ts` | LIB-4 | P1 |
| BB | `lib/auth.ts` | LIB-HIGH-1 | P1 |
| BC | `lib/rate-limit.ts` | LIB-HIGH-2 | P1 |
| C | `app/api/cron/stripe-sync/route.ts` | Issue 4 | P1 |
| D | migrations + `login/route.ts` | Issue 8 | P1 |
| E | migrations + `lib/dal/sites.ts` + `site-form.tsx` | DB-1 | P1 |
| EE | DAL files + migrations | Issue 1 (anon RLS audit) | P1 |
| EF | `app/api/membership/checkout/route.ts` | Issue 3 (KV lock) | P1 |
| EG | migrations 00092 + `check-migrations.sh` | Issue 9 | P1 |
| F | `.semgrep/nextjs-security.yml` | SEM-1/2 | P2 |
| G | `.semgrep/nextjs-security.yml` | SEM-3 | P2 |
| H | `.semgrep/nextjs-security.yml` | SEM-4 | P2 |
| I | `.semgrep/nextjs-security.yml` | SEM-5 | P2 |
| J | `.semgrep/nextjs-security.yml` | SEM-7/8/9/10 | P2 |
| K | `.github/actions/health-check`, `smoke-test` | GH-2 | P2 |
| KK | 4× workflow files | GH-1 | P2 |
| KL | `load-test.yml` | GH-9 | P2 |
| KM | `.github/actions/run-migrations` | GH-8 | P2 |
| KN | `integration-env.sh` | DOCKER-01 | P2 |
| KO | `docs/local-supabase.md` | DOCKER-02 | P2 |
| KP | `main-protection.json`, `CODEOWNERS` | GH-3 | P2 |
| KQ | `preview.yml`, `deploy.yml` | GH-4/5 | P2 |
| L | `app/globals.css` | APP-1 | P3 |
| LL | `app/apple-icon.tsx`, `app/icon.tsx` | APP-2 | P3 |
| LM | `app/sitemap.ts` | APP-4 | P3 |
| LN | `app/layout.tsx` | APP-3 | P3 |
| LO | `app/error.tsx`, `app/not-found.tsx` | APP-5 | P3 |
| LP | `config/define-site.ts` | DB-2 | P3 |
| M | 2× E2E spec files | E2E-05 | P3 |
| MM | 2× E2E spec files | E2E-03 | P3 |
| MN | `e2e/quota-exhaustion.spec.ts` | E2E-02 | P3 |
| MO | `e2e/admin-content.spec.ts`, `admin-products.spec.ts` | E2E-04 | P3 |
| MP | `e2e/newsletter-signup.spec.ts` | E2E-06 | P3 |
| N | 6× workflow files | GH-6 | P3 |
| O | `security.yml`, `main-protection.json` | GH-7 | P3 |
| P | `scripts/validate-cloudflare-bindings.sh` | SCRIPT-01 | P3 |
| Q | `docker-compose.yml`, `docker/kong.yml` | DOCKER-03/04/05 | P3 |
| R | `lib/r2.ts` | LIB-3 | P3 |
| S | `workers/log-shipper`, `rate-limiter-do`, `heavy-crons` | Workers | P3 |
| SS | `workers/custom-worker.ts` | Workers | P3 |
| T | `types/database.ts`, `lib/dal/admin-site-memberships.ts` | Types | P3 |
| U | `vitest.config.ts`, CI workflows | Test config | P3 |
| V | `scripts/pause-site.ts` | SCRIPT-LOW-1 | P3 |
| W | `scripts/check-admin-authz.sh` | SCRIPT-LOW-2 | P3 |

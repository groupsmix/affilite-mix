# Tasks to Fix — Batch 2: P2 Security Hardening
# Semgrep rules, GitHub Actions, composite actions, app security

All items verified as existing in the codebase. Complete Batch 1 first.

---

## Task F — Harden Semgrep `unsafe-redirect` rule (SEM-1 + SEM-2)

**File:** `.semgrep/nextjs-security.yml`
**Risk:**
- `pattern-not: NextResponse.redirect(new URL(..., request.url))` whitelists absolute-first-arg
  `new URL` — `new URL("https://evil.com", request.url)` is an open redirect.
- Single-arg pattern misses `NextResponse.redirect(url, 307)`.
- `Response.redirect(...)` and `redirect()` from `next/navigation` are entirely uncovered.

### Steps
- [ ] F.1 Read the full `unsafe-redirect` rule in `.semgrep/nextjs-security.yml`.
- [ ] F.2 Remove `pattern-not: NextResponse.redirect(new URL(..., request.url))` entirely.
- [ ] F.3 Add narrower allowance for only the safe wrapper:
  ```yaml
  pattern-not: NextResponse.redirect(safeRedirectUrl(...))
  ```
- [ ] F.4 Expand detection with `pattern-either`:
  ```yaml
  pattern-either:
    - pattern: NextResponse.redirect($URL, ...)
    - pattern: Response.redirect($URL, ...)
    - pattern: redirect($URL)
  ```
- [ ] F.5 Raise severity from `WARNING` to `ERROR`.
- [ ] F.6 Create `__tests__/semgrep-fixtures/unsafe-redirect.flag.ts`:
  ```ts
  // @semgrep-expected: flag
  NextResponse.redirect(url, 307);
  NextResponse.redirect(new URL(userInput, request.url));
  Response.redirect(url);
  redirect(untrustedPath);
  ```
- [ ] F.7 Create `__tests__/semgrep-fixtures/unsafe-redirect.pass.ts`:
  ```ts
  // @semgrep-expected: pass
  NextResponse.redirect(safeRedirectUrl(destination));
  ```
- [ ] F.8 `npx semgrep --validate --config .semgrep/` and `npx semgrep --test --config .semgrep/` — both pass.

---

## Task G — Harden `admin-route-missing-auth` rule (SEM-3)

**File:** `.semgrep/nextjs-security.yml`
**Risk:**
- `export const GET = async () => {}` (no wrapper) is silently unchecked.
- `export function GET()` (sync handler) is also unchecked.
- Unbounded `$METHOD` false-positives on helper functions like `export async function buildQuery()`.

### Steps
- [ ] G.1 Read the existing `admin-route-missing-auth` rule.
- [ ] G.2 Add `metavariable-regex` to the existing rule to constrain to HTTP verbs:
  ```yaml
  metavariable-regex:
    metavariable: $METHOD
    regex: ^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$
  ```
- [ ] G.3 Add companion rule for `const` arrow handlers:
  ```yaml
  - id: admin-route-missing-auth-const
    patterns:
      - pattern: export const $METHOD = async (...) => { ... }
      - metavariable-regex:
          metavariable: $METHOD
          regex: ^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$
      - pattern-not: export const $METHOD = withAuthz(...)
      - pattern-not: export const $METHOD = requireAdmin(...)
      - pattern-not: export const $METHOD = requireSuperAdmin(...)
    paths:
      include:
        - "app/api/admin/**/route.ts"
        - "app/api/admin/**/route.tsx"
    message: "Admin route const handler exported without auth wrapper"
    languages: [typescript]
    severity: ERROR
    metadata:
      category: security
      audit-ref: SEM-3
  ```
- [ ] G.4 Add companion rule for sync function handlers (same structure as G.3 but matching
  `export function $METHOD(...) { ... }`).
- [ ] G.5 Create fixture files with all three bypass shapes and a passing withAuthz-wrapped shape.
- [ ] G.6 `npx semgrep --validate` and `npx semgrep --test` — both pass.

---

## Task H — Harden `service-role-import` rule — cover all import forms (SEM-4)

**File:** `.semgrep/nextjs-security.yml`
**Risk:** Only named `import { ... }` is detected. Namespace, default, `require()`, and
dynamic `import()` bypass the rule silently. Severity is `WARNING` so it doesn't fail CI.

### Steps
- [ ] H.1 Read the existing `service-role-import` rule.
- [ ] H.2 Replace the single `pattern:` with `pattern-either:`:
  ```yaml
  pattern-either:
    - pattern: import { ... } from "@/lib/server-only/service-role"
    - pattern: import * as $NS from "@/lib/server-only/service-role"
    - pattern: import $DEFAULT from "@/lib/server-only/service-role"
    - pattern: require("@/lib/server-only/service-role")
    - pattern: import("@/lib/server-only/service-role")
  ```
- [ ] H.3 Raise severity from `WARNING` to `ERROR`.
- [ ] H.4 Exclude the allowlist file and tests from the path scope:
  ```yaml
  paths:
    exclude:
      - "lib/security/service-role-allowlist.ts"
      - "__tests__/**"
  ```
- [ ] H.5 For every legitimate approved usage outside those paths, add:
  `// nosemgrep: service-role-import` with a justification comment.
- [ ] H.6 Create fixture files for all five bypass forms and run `npx semgrep --test`.

---

## Task I — Harden `raw-ip-header-parsing` rule — receiver + casing (SEM-5)

**File:** `.semgrep/nextjs-security.yml`
**Risk:** Rule hardcodes `request` as the receiver and `x-forwarded-for` as the exact casing.
`req.headers.get(...)` and `"X-Forwarded-For"` are both missed.

### Steps
- [ ] I.1 Read the existing `raw-ip-header-parsing` rule.
- [ ] I.2 Add receiver metavariable and casing variants:
  ```yaml
  pattern-either:
    - pattern: $REQ.headers.get("x-forwarded-for")
    - pattern: $REQ.headers.get("X-Forwarded-For")
    - pattern: $REQ.headers.get("X-FORWARDED-FOR")
  ```
- [ ] I.3 Preserve `pattern-not-inside: function getClientIp(...)`.
- [ ] I.4 Add fixture for `req.headers.get("X-Forwarded-For")`.
- [ ] I.5 `npx semgrep --test` — pass.

---

## Task J — Address remaining low-noise Semgrep items (SEM-7 / SEM-8 / SEM-9 / SEM-10)

**File:** `.semgrep/nextjs-security.yml`

### Steps
- [ ] J.1 **SEM-9 path scope** — check whether privileged routes exist under `app/api/cron/**`,
  `app/api/internal/**`, or server actions. If so, decide whether to extend the
  `admin-route-missing-auth` path scope to cover them or document why they're excluded.
- [ ] J.2 **SEM-8 allowlist noise** — verify that every approved import in
  `lib/security/service-role-allowlist.ts` either has a `// nosemgrep` comment or is in
  an excluded path. Clean up any remaining WARNING noise.
- [ ] J.3 **SEM-10 audit-ref cleanup** — standardise `metadata.audit-ref` values across all
  rules to a consistent format (e.g. `AUDIT-{N}` or `SEM-{N}`).
- [ ] J.4 `npx semgrep --validate` — pass.

---

## Task K — Fix composite action shell injection (GH-2)

**Files:** `.github/actions/health-check/action.yml`, `.github/actions/smoke-test/action.yml`
**Risk:** `${{ inputs.xxx }}` is expanded by GitHub into the rendered script body before bash
runs. A newline in an input becomes a shell command.

### Steps

**health-check (action.yml lines 17–30):**
- [ ] K.1 Move `${{ inputs.cron-host }}` and `${{ inputs.cron-secret }}` into an `env:` block:
  ```yaml
  env:
    CRON_HOST: ${{ inputs.cron-host }}
    CRON_SECRET: ${{ inputs.cron-secret }}
  run: |
    set -euo pipefail
    # use $CRON_HOST and $CRON_SECRET
  ```
- [ ] K.2 Confirm no `${{ inputs.* }}` remains inside the `run:` body.

**smoke-test (action.yml lines 15–30):**
- [ ] K.3 Move `host`, `paths`, `timeout` into `env:` block.
- [ ] K.4 Add `set -euo pipefail` as first line (currently missing).
- [ ] K.5 Add hostname allowlist check before first network call:
  ```bash
  if ! echo "$HOST" | grep -qE '^[A-Za-z0-9.-]+$'; then
    echo "::error::Invalid host value"; exit 1
  fi
  ```
- [ ] K.6 Validate each path entry starts with `/`.
- [ ] K.7 Confirm no `${{ inputs.* }}` remains in the `run:` body.
- [ ] K.8 `actionlint` on both files — pass.

---

## Task KK — Add `permissions: {}` to four workflows (GH-1)

**Files:** `rollback.yml`, `dr-drill.yml`, `load-test.yml`, `backup-restore-drill.yml`
**Risk:** All four inherit the repo/org default `GITHUB_TOKEN` scope. None need any token scope.

### Steps
- [ ] KK.1 Add to each file immediately below `on:`:
  ```yaml
  permissions: {}
  ```
- [ ] KK.2 Confirm no job in any of the four uses `GITHUB_TOKEN` write scope.
- [ ] KK.3 `actionlint` on all four — pass.

---

## Task KL — Validate `load-test.yml` target URL to prevent SSRF (GH-9)

**File:** `.github/workflows/load-test.yml`
**Risk:** `target_url` from `workflow_dispatch` flows unvalidated into the load script,
allowing GitHub runners to be aimed at arbitrary hosts.

### Steps
- [ ] KL.1 Find where `target_url` is passed to the load script.
- [ ] KL.2 Add a validation step before the load job:
  ```bash
  if ! echo "$TARGET_URL" | grep -qE '^https://[a-zA-Z0-9.-]+\.(your-allowed-domain)\.'; then
    echo "::error::target_url must match an allowed domain"; exit 1
  fi
  ```
  Update the regex to match the actual staging/prod domains used for load testing.
- [ ] KL.3 `actionlint` — pass.

---

## Task KM — Improve `run-migrations` dry-run to do real SQL parse (GH-8 / R17)

**File:** `.github/actions/run-migrations/action.yml` lines 64–76
**Risk:** Dry-run "validation" is a keyword grep (`head -50 | grep -E '(CREATE|ALTER|...'`),
not real SQL validation. The step name "Dry-run validation" implies more than it delivers.

### Steps
- [ ] KM.1 Read the dry-run step in full.
- [ ] KM.2 Replace the keyword grep with a real parse-only check using psql in a throwaway
  transaction:
  ```bash
  psql "$DATABASE_URL" --single-transaction --dry-run -f "$file" 2>&1
  ```
  Or if psql `--dry-run` is unavailable, use:
  ```bash
  psql "$DATABASE_URL" -c "BEGIN; $(cat $file); ROLLBACK;" 2>&1
  ```
- [ ] KM.3 Rename the step from "Dry-run validation" to "SQL parse check (throwaway transaction)"
  to accurately describe what it does.
- [ ] KM.4 Feed a syntactically invalid `.sql` file and confirm the step exits non-zero.

---

## Task KN — Docker: Fix integration-env.sh JWT mismatch (DOCKER-01)

**Files:** `scripts/integration-env.sh`, `docker-compose.yml`
**Risk (Critical for local dev):** `docker-compose.yml` requires `LOCAL_JWT_SECRET` with no
fallback, but `integration-env.sh` uses hardcoded demo JWTs signed with a different key.
Any developer with a real secret gets 401s on all PostgREST calls in integration tests.

### Steps
- [ ] KN.1 Read `docker-compose.yml` — find the `LOCAL_JWT_SECRET:?ERROR:...` requirement.
- [ ] KN.2 Read `integration-env.sh` — find the hardcoded JWT exports.
- [ ] KN.3 Update `integration-env.sh` to derive its JWTs from `LOCAL_JWT_SECRET` at
  script-run time (either by sourcing `.env.local` first or by generating test tokens
  using the same secret).
- [ ] KN.4 Add a comment in `integration-env.sh` explaining the dependency on `LOCAL_JWT_SECRET`.

---

## Task KO — Docker: Add `--env-file .env.local` to all local-supabase docs (DOCKER-02)

**Files:** `docs/local-supabase.md` (or equivalent), integration script comment headers
**Risk:** Every code snippet shows bare `docker compose up -d`, which fails without `.env.local`.
New developers hit silent failures with no clear error.

### Steps
- [ ] KO.1 Find all `docker compose up` examples in docs and comment headers.
- [ ] KO.2 Update each to `docker compose --env-file .env.local up -d`.
- [ ] KO.3 Add a note in the docs explaining `.env.local` is required and pointing to
  `.env.local.example` (create it if missing).
- [ ] KO.4 Add the following to `.env.local.example` if not present:
  ```
  LOCAL_JWT_SECRET=<generate-with-openssl-rand-base64-32>
  ```

---

## Task KP — Address CODEOWNERS false-assurance (GH-3)

**File:** `.github/rulesets/main-protection.json`, `.github/CODEOWNERS`,
`__tests__/audit3-locks.test.ts`
**Risk:** CODEOWNERS routes security-sensitive paths to `@groupsmix/security`, but
`require_code_owner_review: false` and `required_approving_review_count: 0` mean nothing
enforces that routing. `audit3-locks.test.ts` asserts the CODEOWNERS file contents and
passes, reinforcing a boundary that isn't actually enforced.

### Steps
- [ ] KP.1 Read `main-protection.json` to confirm the current solo-dev tradeoff comment.
- [ ] KP.2 **Choose one:**
  - **Option A (document only):** Add a prominent comment block in `CODEOWNERS` and in the
    `audit3-locks.test.ts` test asserting this file that explicitly states:
    _"CODEOWNERS is advisory-only in this repo. No merge gate enforces code-owner review.
    The test below validates file contents only, not enforcement."_
  - **Option B (enforce):** Set `require_code_owner_review: true` and
    `required_approving_review_count: 1` in `main-protection.json` if a second reviewer
    is available.
- [ ] KP.3 Update the `audit3-locks.test.ts` description for the CODEOWNERS assertion to
  make clear it is a content check, not an enforcement check.

---

## Task KQ — Document preview E2E gate gap and deploy drift behaviour (GH-4 + GH-5)

**Files:** `.github/workflows/preview.yml`, `.github/workflows/deploy.yml`
**Risk:** The preview E2E gate exits 0 when `ENABLE_PREVIEW_DEPLOYS` is off (skipped
result). Deploy drift and smoke steps are `continue-on-error: true` — failures are logged
but never block the deploy. Both look enforced but aren't.

### Steps
- [ ] KQ.1 Read `preview.yml` around line 315 — find the gate skip behaviour.
- [ ] KQ.2 **For the preview gate:** Add a `::notice::` (or upgrade to `::error::`) that
  explicitly says "Preview E2E gate skipped — this is a required check with no E2E coverage
  in the current config." If enforcing is desired, add a step that exits 1 when both results
  are `skipped` on the protected branch.
- [ ] KQ.3 Read `deploy.yml` around lines 1791 and 1886 — find the `continue-on-error: true`
  steps.
- [ ] KQ.4 **For deploy drift/smoke:** Either:
  - Remove `continue-on-error: true` to make these blocking, or
  - Keep `continue-on-error: true` but add a downstream notification step that fails the
    workflow if the drift/smoke steps produced non-zero exit codes (check
    `steps.<id>.outcome == 'failure'`).
- [ ] KQ.5 Add a comment above each `continue-on-error: true` step explaining the deliberate
  decision so future reviewers understand it is intentional, not forgotten.

---

## Completion check

- [ ] `npx semgrep --validate --config .semgrep/` — pass
- [ ] `npx semgrep --test --config .semgrep/` — all fixtures pass
- [ ] `actionlint` on changed workflow/action files — pass
- [ ] `npm run typecheck` — exit 0
- [ ] `npm run build` — no errors

→ Proceed to `taskstofix3.md`

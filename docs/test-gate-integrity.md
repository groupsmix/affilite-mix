# Test-gate integrity

This document describes the CI test-execution gates that keep required checks
honest, and the **external configuration** (GitHub secrets, repository
variables, branch-protection settings, labels) that a repository administrator
must apply for the gates to enforce real execution rather than fail closed.

The gates exist because a green required job is not, by itself, evidence that
meaningful tests ran: a suite can report success while every test is skipped
(missing backend, dynamic `test.skip`, a `describe.skipIf`). See the QA/SRE
audit findings P0-1, P1-1, P1-2, and P1-7.

## Gates in this repository

| Gate                         | Where                                                                 | What it enforces                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration execution        | `Integration tests` job (`ci.yml`) → `scripts/ci/integration-gate.sh` | Runs the real Supabase integration/RLS suite when staging secrets are present and enforces an executed-count floor (`INTEGRATION_MIN_EXECUTED`, default 40) plus mandatory RLS execution. Fails closed when secrets are missing in a trusted context. |
| E2E execution & skip honesty | `E2E tests` job (`ci.yml`) → `scripts/ci/e2e-gate.sh`                 | Fails on a hollow run (fewer than `E2E_MIN_EXECUTED`, default 8, executed) and on any skip whose reason is not on the reviewed allow-list (`scripts/ci/e2e-allowed-skips*.json`).                                                                     |
| Preview E2E                  | `Preview E2E gate` job (`preview.yml`)                                | Fails closed for PRs into a protected base (`main`) when preview + E2E both skip, unless the `skip-preview-e2e` exception label is present.                                                                                                           |
| Execution-count checker      | `scripts/ci/check-test-execution.mjs`                                 | Shared, dependency-free checker used by the integration and E2E gates; unit-tested in `__tests__/ci/check-test-execution.test.ts`.                                                                                                                    |

### Trusted vs. untrusted context

The integration gate mirrors the existing `db-audit` / `db-types` gating policy
(N-005): a **trusted context** is a `push` or a same-repo, non-Dependabot pull
request. In a trusted context, missing staging secrets **fail the job**. Fork
PRs cannot read repository secrets, so they skip green with a visible warning.

### Local opt-out

Running the suites locally is unaffected. `npm test` and
`npm run test:integration` skip the real-backend suites automatically when the
Supabase env vars are unset/placeholder, so offline development stays green. The
fail-closed behaviour only applies inside the CI trusted context.

## Required external configuration

These cannot live in the repository and must be applied by an administrator.

### 1. Staging Supabase secrets (makes the integration gate execute)

Provision an **isolated staging Supabase project** (never production) and add:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`

Add them under **Settings → Secrets and variables → Actions → Secrets**. Until
they exist, the `Integration tests` job fails closed on trusted-context runs by
design (this is the "make missing required configuration explicit" behaviour).

### 2. Authenticated E2E admin fixtures (makes admin journeys non-skippable)

The E2E gate currently allows authenticated-admin specs to skip because no admin
session is provisioned in CI. To make them non-skippable:

1. Provision a deterministic staging admin identity and generate a Playwright
   storage state during the E2E job.
2. Set `E2E_ADMIN_AUTH_PROVISIONED=true` for the `E2E tests` job.

Once set, the gate stops allowing the `admin auth not provisioned` /
`Admin guard rejected the test JWT` skip reasons, so those journeys must run.

### 3. Preview deployments (or the exception label)

Either enable preview deploys so the `Preview E2E gate` runs real tests:

- Set the repository variable `ENABLE_PREVIEW_DEPLOYS=true` and configure the
  Cloudflare + staging Supabase secrets described in `docs/CLOUDFLARE.md`.

…or, for a reviewed, time-bounded exception on a specific PR into `main`, create
and apply the label:

- **Label:** `skip-preview-e2e` (create it under **Issues → Labels**). Applying
  it to a PR records the exception and lets the gate pass while preview E2E is
  skipped.

### 4. Branch protection required checks

Mark these status checks required for `main` (**Settings → Branches → Branch
protection rules → Require status checks**). Keep this list in sync with
`CONTRIBUTING.md` and the `required-checks` comment in `ci.yml`:

- `Required checks`
- `Integration tests`
- `E2E tests`
- `Load tests`
- `Chaos tests`
- `Preview E2E gate`
- `npm audit (moderate+)`
- `License compliance`
- `Dependency review`

Export the live ruleset and confirm the required contexts match the check names
emitted at the current commit; stale names silently stop enforcing.

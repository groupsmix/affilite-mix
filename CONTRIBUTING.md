# Contributing to Affilite-Mix

Thank you for your interest in contributing! This guide covers the conventions and workflows used in this project.

---

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/groupsmix/affilite-mix.git
   cd affilite-mix
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Fill in the required values (see `.env.example` for descriptions).

4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. **Run the seed script** (optional, populates sample data):
   ```bash
   npm run seed
   ```

---

## Branch Naming

Use the following format for branch names:

```
<type>/<short-description>
```

**Types:**

- `feat/` — new feature
- `fix/` — bug fix
- `docs/` — documentation only
- `refactor/` — code restructuring without behavior change
- `test/` — adding or updating tests
- `chore/` — tooling, CI, dependencies, etc.

**Examples:**

```
feat/gift-finder-api
fix/csrf-token-rotation
docs/api-reference
chore/add-prettier
```

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`

**Scope** (optional): the area of the codebase (e.g., `auth`, `admin`, `dal`, `e2e`, `config`)

**Examples:**

```
feat(admin): add bulk product import endpoint
fix(auth): prevent timing attack on password comparison
docs: add API reference documentation
chore(ci): add Playwright E2E tests to CI pipeline
refactor(dal): extract common query builder
```

---

## Pull Request Process

1. **Create a feature branch** from `main`.
2. **Make your changes** with clear, focused commits.
3. **Run checks locally** before pushing:
   ```bash
   npm run lint        # ESLint
   npm run typecheck   # TypeScript strict mode
   npm test            # Vitest unit tests
   npm run build       # Full production build
   ```
4. **Push your branch** and open a PR against `main`.
5. **PR title** should follow the commit message format (e.g., `feat(admin): add product import`).
6. **PR description** should include:
   - What changed and why
   - How to test (if applicable)
   - Screenshots for UI changes
7. **CI must pass** — the pipeline runs lint, typecheck, tests, security audit, and build.

   The following status checks **must be marked required** in branch protection
   for `main`. The context name is the job's display name; the owning workflow
   is shown in parentheses:

   - `Required checks` (`.github/workflows/ci.yml` — aggregates lint + typecheck + unit tests + build + audit)
   - `Integration tests` (`ci.yml` — real Supabase integration/RLS suite; fail-closed when staging secrets are missing in a trusted context)
   - `E2E tests` (`ci.yml` — Playwright against a locally built app, with an execution + skip-honesty gate)
   - `Load tests` (`ci.yml` — k6 load tests)
   - `Chaos tests` (`ci.yml` — AZ/KV/cache failure simulations)
   - `Preview E2E gate` (`.github/workflows/preview.yml` — deploys to Cloudflare Workers staging and re-runs Playwright against the preview URL; fails closed when preview E2E is skipped for a PR into `main` unless the `skip-preview-e2e` exception label is applied)
   - `npm audit (moderate+)` (`.github/workflows/security.yml`)
   - `License compliance` (`security.yml`)
   - `Dependency review` (`security.yml`, PRs only)

   There is no `.github/workflows/e2e.yml`; E2E runs inside `ci.yml` (local
   build) and `preview.yml` (preview URL). When adding new required workflows,
   update this list and the canonical list in the `required-checks` job comment
   in `ci.yml`.

8. **Request a review** from a maintainer.
9. **Squash and merge** is the default merge strategy.

---

## Code Style

- **TypeScript strict mode** — no `any` types unless absolutely necessary.
- **ESLint** with `next/core-web-vitals` — fix all lint errors before committing.
- **Prettier** — formatting is enforced via `.prettierrc`. Run `npx prettier --write .` to format.
- **Imports** — always at the top of the file. Use `@/` path aliases for project imports.
- **Naming:**
  - Files: `kebab-case.ts` (e.g., `admin-guard.ts`)
  - Components: `PascalCase.tsx` (e.g., `CookieConsent.tsx`)
  - Functions/variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Database columns: `snake_case`
- **Comments:** Follow the style of surrounding code. Add JSDoc for public functions. Don't add obvious comments.

---

## Testing

### Unit Tests (Vitest)

```bash
npm test              # run all tests
npm test -- --watch   # watch mode
npm test -- <pattern> # run specific test file
```

Tests are in `__tests__/` and mirror the `lib/` structure.

### Integration Tests (Vitest)

Integration tests use a separate config (`vitest.integration.config.ts`) so they
can run with different setup/timeouts and stay out of the default `npm test` run:

```bash
npm run test:integration   # uses vitest.integration.config.ts
```

Use the default unit config (`vitest.config.ts`, run via `npm test`) for fast,
isolated tests with mocked dependencies. Use the integration config for tests
that exercise real wiring (e.g. RLS-isolation suites that hit a live Supabase
instance); those skip automatically when the required env vars are absent, which
keeps local `npm run test:integration` green offline.

In CI the `Integration tests` job runs `scripts/ci/integration-gate.sh`. When
the `STAGING_SUPABASE_*` secrets are configured it runs the suite against the
isolated staging project and enforces an executed-count floor plus mandatory RLS
execution; when they are missing it **fails closed** in trusted contexts (push /
same-repo PR) and skips green only for fork PRs (which cannot read secrets).

### E2E Tests (Playwright)

```bash
npm run test:e2e      # run all E2E tests
npx playwright test --ui  # interactive UI mode
```

E2E tests are in `e2e/` and test critical user flows (admin login, content management, newsletter signup, etc.).

### Accessibility smoke tests

`e2e/accessibility.spec.ts` runs `@axe-core/playwright` against the public pages and fails on any `critical` or `serious` WCAG 2.1 A/AA violation. Run it alongside the rest of the Playwright suite:

```bash
npm run test:e2e -- accessibility.spec.ts
```

### RLS isolation tests

`__tests__/rls-isolation.test.ts` (unit-level, mocked) and `__tests__/rls-isolation.integration.test.ts` (real backend) verify that the Supabase anon key cannot insert/update/delete rows in tenant tables and cannot read draft/non-active rows. The suites auto-skip when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset or use placeholder values, so local runs stay green. The real-backend RLS suite runs in CI via the `Integration tests` job (`ci.yml` → `scripts/ci/integration-gate.sh`), which requires the `STAGING_SUPABASE_*` secrets and enforces that RLS actually executes.

### DAL site-scoping tests

`__tests__/dal-site-scoping.test.ts` mocks Supabase with a recording proxy and asserts that **every** read/update/delete function in `lib/dal/` applies an `.eq("site_id", …)` filter (and every insert includes a `site_id`). When you add a new DAL function, add a corresponding test here — a missing filter is a cross-tenant data leak.

### Writing Tests

- Place unit tests in `__tests__/<module>.test.ts`.
- Place E2E tests in `e2e/<feature>.spec.ts`.
- Use factory functions for test data (see existing tests for patterns).
- Don't mock what you don't own — mock the boundary (DAL layer, not Supabase internals).

---

## Security

- **Never commit secrets** — use environment variables.
- **Sanitize all HTML** — use `sanitizeHtml()` from `lib/sanitize-html.ts`.
- **Validate all input** — use validators from `lib/validation.ts`.
- **CSRF protection** — all state-changing endpoints require a valid CSRF token.
- **Rate limiting** — all public and admin endpoints have rate limits.
- See `docs/secrets-rotation-runbook.md` for secrets management.

---

## DCO Sign-Off Requirement (A178)

All contributions must include a `Signed-off-by` line in the commit message, certifying the [Developer Certificate of Origin (DCO)](https://developercertificate.org/):

```
Signed-off-by: Your Name <your.email@example.com>
```

Add it automatically with `git commit -s`. Pull requests without a valid sign-off on every commit will not be merged.

---

## Intellectual Property & Contractor Contributions (A197)

Before being granted commit access to this repository, external contractors and freelancers must have a signed **Proprietary Information and Inventions Assignment (PIIA)** agreement on file with the organization. This ensures that all contributions are properly assigned and that IP ownership is clear.

- **Employees:** Covered by the standard employment agreement's invention-assignment clause.
- **Contractors:** Must sign the PIIA template (contact the Engineering Lead) before submitting any code.
- **Open-source contributions:** Governed by the project `LICENSE` and the DCO sign-off above.

---

## Project Structure

```
app/
  api/            # API routes (auth, admin, public, cron)
  (public)/       # Public-facing pages (SSR/ISR)
  admin/          # Admin dashboard (client-side)
config/           # Site definitions and multi-tenant config
lib/              # Shared utilities, DAL, auth, validation
  dal/            # Data access layer (Supabase queries)
supabase/
  migrations/     # Database migration SQL files
e2e/              # Playwright E2E tests
__tests__/        # Vitest unit tests
docs/             # Project documentation
scripts/          # CLI tools (seed, add-site, etc.)
```

---

## Need Help?

- Check the [README](README.md) for setup and architecture details.
- Check `docs/api-reference.md` for endpoint documentation.
- Open an issue for bugs or feature requests.

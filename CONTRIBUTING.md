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

### E2E Tests (Playwright)

```bash
npm run test:e2e      # run all E2E tests
npx playwright test --ui  # interactive UI mode
```

E2E tests are in `e2e/` and test critical user flows (admin login, content management, newsletter signup, etc.).

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

# Audit 2026-05-28(1) — Tracked Tech-Debt Follow-ups

This file tracks **non-blocker** items from the 2026-05-28(1) audit that
are NOT addressed in the P0/P1/P2/P3 batched PRs and need a dedicated
follow-up. Each entry has an owner, a tentative date, and a clear
acceptance criterion so the work cannot drift indefinitely.

The source audit is at
`docs/audits/affilite-mix-audit-2026-05-28(1).md` (or whichever local
filename it lands under) and lists 40 findings; this file is for the
ones the batches explicitly deferred.

---

## CSP `style-src` `unsafe-inline` removal — audit5-#6

- **Owner:** Frontend
- **Status:** Tracked / accepted risk
- **Target:** 2026-09-01 (per existing in-code revisit comment)
- **Rationale for deferring:** The current posture (`script-src` locked
  to `'nonce-XXX' 'strict-dynamic'`; `style-src 'unsafe-inline'`) is
  the standard production CSP for apps that use libraries doing
  runtime `element.style.X = …` writes (here: vanilla-cookieconsent,
  ThemeProvider). Removing `'unsafe-inline'` from `style-src` without
  first migrating those writers to class-based styling breaks the
  cookie consent banner and theme switching.
- **Compensating control today:** `lib/sanitize-html.ts` strips
  `style` attributes from all user-authored content, so the only
  remaining vector is an already-privileged admin's content editor.
- **Acceptance criterion for closure:**
  1. vanilla-cookieconsent v3 (or a fork) supports nonced styles, OR
     the integration is rewritten to use class-based styling.
  2. ThemeProvider does the same migration.
  3. `lib/csp.ts:151` is changed to `style-src 'self' 'nonce-${nonce}'`
     and the existing CSP report-uri/report-to endpoint shows zero
     `style-src` violations across 7 days of production traffic.
- **References:** `lib/csp.ts:139-151` (current rationale comment).

---

## `getTenantClient()` split into public + admin variants — audit5-#7

- **Owner:** Backend
- **Status:** Tracked / not urgent
- **Target:** Q1 2027 (alongside the existing F-026 dal cleanup)
- **Rationale for deferring:** The proposed split touches every public
  DAL function and every page route. A safe migration needs a deprecation
  shim, a Vitest assertion that public routes never import the admin
  variant, and a tree-shake verification that the admin variant doesn't
  leak into the public bundle. That is not P2-batch surface area.
- **Acceptance criterion for closure:**
  1. `lib/supabase-server.ts` exports `getTenantClientForPublic` (no
     cookie touch, no admin membership lookup) and
     `getTenantClientForAdmin` (current behaviour).
  2. `getTenantClient()` is removed or kept as a thin alias that emits
     a deprecation warning.
  3. ESLint rule rejects `import { getTenantClient } from "@/lib/supabase-server"`
     outside `lib/dal/admin-*`.

---

## CI ephemeral secret generation — audit5-#14

- **Owner:** DevOps / SRE
- **Status:** Tracked / low priority
- **Target:** When the next major workflow refactor happens (see #15).
- **Rationale for deferring:** The proposed refactor adds a "generate
  ephemeral secrets" step at the start of every job in `ci.yml` (~12
  jobs × 8-line setup step). The current static-placeholder approach
  is correct (CI secrets are NOT real secrets) and the failure mode the
  audit calls out — a future contributor copy-pasting the CI env into a
  deploy workflow — is mitigated by `.github/workflows/deploy.yml`
  already using real `${{ secrets.* }}` references throughout.
- **Acceptance criterion for closure:**
  1. CI workflows generate `JWT_SECRET`, `CRON_SECRET`,
     `INTERNAL_API_TOKEN`, `TOTP_ENCRYPTION_KEY`, `CLICK_CACHE_HMAC_KEY`,
     and `GDPR_HASH_SECRET` per job via `openssl rand -hex 32` written
     to `$GITHUB_ENV`.
  2. The static `env:` block at the top of `ci.yml` no longer contains
     these names.

---

## `deploy.yml` refactor into composite actions — audit5-#15

- **Owner:** DevOps / SRE
- **Status:** Tracked / scheduled
- **Target:** Q1 2027 (also flagged in `docs/audits/audit-unfixed-items.md` #18)
- **Rationale for deferring:** `deploy.yml` is 1518 lines, ~70%
  inline bash heredocs. A safe refactor needs (a) extracted composite
  actions under `.github/actions/*` for KV bootstrap, DO bootstrap,
  DB migration, queue creation, gradual rollout; (b) a staging-only
  test of the refactored pipeline; (c) a documented rollback if the
  refactor breaks the prod deploy. This is a dedicated sprint of
  work, not a P2-batch line item.
- **Acceptance criterion for closure:**
  1. `deploy.yml` is under 400 lines.
  2. Each major phase (KV, DO, migrate, build, deploy, rollout, smoke)
     lives in its own composite action.
  3. A test PR that touches a single phase only invalidates that
     phase's CI cache.

---

## Lighthouse against a real preview deployment — audit5-#19

- **Owner:** DevOps / SRE
- **Status:** Blocked on preview-deploy infrastructure
- **Target:** When the preview environment with real upstreams is
  finalised.
- **Rationale for deferring:** Audit recommendation requires a
  Lighthouse run against a deployment with real Supabase, Stripe,
  Turnstile, Sentry, and affiliate API endpoints. P2 contributed the
  config side of the fix (`LIGHTHOUSE_STRICT_CONSOLE=1` env flag to
  re-enable the audits) but the workflow change to actually exercise
  it requires a deployment URL that isn't a placeholder.
- **Acceptance criterion for closure:**
  1. `.github/workflows/lighthouse.yml` exposes a `preview-url`
     input/dispatch parameter and runs `LIGHTHOUSE_STRICT_CONSOLE=1
npx @lhci/cli autorun` against it on each release candidate.

---

## DLQ overflow on-call routing target — audit5-#28

- **Owner:** SRE
- **Status:** Tracked / awaiting PagerDuty/Opsgenie rotation IDs
- **Target:** Before launch (information needed from on-call manager).
- **Rationale for deferring:** P0 added the runbook section and the
  alert template; the per-rotation target ID (e.g. PagerDuty service
  key or Opsgenie team id) belongs in `docs/runbooks/dlq-overflow.md`
  and can only be filled in by the on-call manager.
- **Acceptance criterion for closure:**
  1. `docs/runbooks/dlq-overflow.md` "On-call Routing" section lists
     the production rotation target.
  2. A Sentry alert rule is configured to fan out to that target on a
     DLQ-depth threshold breach.

---

## DOM-write CSP migration tracking ticket — bookkeeping for audit5-#6

If your project tracker is GitHub Issues, open one labelled
`tech-debt / security / csp` with the same content as the #6 entry
above. Cross-link the issue here once it exists.

---

## Gift-finder A/B experiment framework — audit5-#11

- **Owner:** Growth
- **Status:** Tracked / explicitly out-of-scope for launch
- **Target:** Q2 2026 (post-launch iteration window).
- **Rationale for deferring:** The audit flagged this as LOW and
  marked it _explicitly out-of-scope for launch_. Introducing an A/B
  framework requires picking a vendor (PostHog feature flags, GrowthBook,
  homegrown KV-bucketed), wiring consent (the bucket cookie is itself
  consent-relevant), and persisting the experiment cohort for
  attribution. None of this is launch-blocking, and shipping a
  half-baked framework is worse than no framework.
- **Acceptance criterion for closure:**
  1. A documented choice of A/B vendor in `docs/growth/ab-testing.md`.
  2. A consent-aware bucketing helper that respects the existing
     `cookieConsent` `analytics` category.
  3. At least one production experiment running end-to-end with
     reportable lift in `nh_active_gift_finder_variant`.
- **References:** `app/(public)/gift-finder/*`,
  `app/api/track/click/route.ts` (attribution surface).

---

## `requireAdminSession()` → `requireAdminSessionBeforeSiteSelect()` rename — audit5-#12

- **Owner:** Backend
- **Status:** Tracked / cosmetic
- **Target:** Q1 2027 (low-risk batched rename window).
- **Rationale for deferring:** The audit itself marked this **cosmetic;
  defer**. The rename touches ~30 files across `app/api/admin/sites/*`
  and the admin dashboard pages, plus regex-style assertions in
  `__tests__/admin-route-authz-enforcement.test.ts` that pin the
  function name. Doing it inside the launch-blocker batch increases
  diff churn without any reliability benefit. In the meantime the P3
  PR landed a strong JSDoc on the function and a call-sites whitelist
  in the docstring; an over-zealous reviewer cannot quietly add a new
  consumer without tripping the test.
- **Acceptance criterion for closure:**
  1. `lib/admin-guard.ts` exports `requireAdminSessionBeforeSiteSelect`.
  2. All four call sites updated; old export removed.
  3. `__tests__/admin-route-authz-enforcement.test.ts` regex updated to
     match the new name.
- **References:** `lib/admin-guard.ts` (current docstring with
  whitelist), `__tests__/admin-route-authz-enforcement.test.ts:78-84`.

---

## Newsletter confirm token TTL display — audit5-#20

- **Owner:** Frontend (admin UI)
- **Status:** Tracked / UX-only
- **Target:** Q2 2026 (next admin UI batch).
- **Rationale for deferring:** The backend already enforces a token
  TTL (`NEWSLETTER_CONFIRM_TOKEN_TTL_HOURS`, default 48h) and the cron
  cleans up expired rows. The audit's recommendation is purely a UX
  improvement: show admins how much longer an unconfirmed subscriber's
  token has before it expires. This is a column in the admin UI table
  and a backend RPC change that returns `confirm_token_expires_at`.
  Neither blocks launch; both belong in the next admin-UI iteration.
- **Acceptance criterion for closure:**
  1. Admin newsletter list shows "Expires in Xh" for unconfirmed rows.
  2. The "Resend confirm email" admin action also re-issues the token
     (extends TTL) instead of leaving the old one to expire.
- **References:** `lib/dal/newsletter.ts`,
  `app/admin/(dashboard)/newsletter/*`.

---

_Last updated: 2026-05-28._

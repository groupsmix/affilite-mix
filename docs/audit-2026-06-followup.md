# 2026-06 External Audit — Per-Finding Follow-Up

**Source audit:** `affilite-mix-full-audit.md` (28 findings, dated 2026-06-03)
**Reviewed against `main` on:** 2026-06-09
**Status legend:**

| Symbol | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| ✅     | Already addressed in code at the audit date. No action needed. |
| 🟢     | Fixed in this branch (`fix/audit-2026-06`).                    |
| 🟡     | Partially addressed; operator action required (see notes).     |
| 🟠     | Documented design choice / accepted risk. No code change.      |
| ⏭️     | Skipped — speculative or false-positive in the original audit. |

The audit was conducted via the GitHub web interface; the auditor explicitly
flagged many findings as `UNVERIFIED`. Several of those finding either no
longer apply (the code already handled them) or never applied to begin with.
This document is the canonical reconciliation.

---

## CRITICAL

### #1 — APP_URL hardcoded as single-tenant in wrangler.jsonc — ✅ ALREADY HANDLED

`wrangler.jsonc` does set `APP_URL=https://wristnerd.xyz` in `vars`, but the
**actual user-facing flows that emit absolute URLs already resolve the
canonical origin from the resolved tenant site, not from `APP_URL`**:

- `app/api/auth/forgot-password/route.ts` (line 86-90):

  ```ts
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? `https://${site.domain}`
      : process.env.APP_URL || `https://${site.domain}`;
  ```

  In production the reset link **always** uses `site.domain` from the
  per-request `getCurrentSite()` resolution. `APP_URL` is a dev-only override.

- `app/api/membership/checkout/route.ts` already prefers `tenantOrigin`.

- `app/landing/layout.tsx` is the global landing page (not tenant-scoped) and
  the static `affilite-mix.com` fallback is intentional.

The remaining consumer of `process.env.APP_URL` —
`app/api/cron/price-scrape/route.ts` — is the cron worker's own self-call URL
(it talks to _itself_), so a single-tenant value is correct there.

**No change required.** The audit's threat scenario (a CryptoRanked user
receiving a wristnerd.xyz reset link) is not reachable.

---

### #2 — Turnstile disabled by default — ✅ ALREADY HANDLED

`lib/server-env.ts` (RISK-16 + F-005 block):

- Defaults Turnstile to ON in production (the `turnstile.ts` default flips
  to enabled when `NODE_ENV=production`).
- Explicitly disabling Turnstile in production
  (`ENABLE_TURNSTILE=false|0`) is rejected as a hard startup failure
  unless the operator opts in with `ALLOW_TURNSTILE_DISABLED_IN_PROD=1`.
- Once Turnstile is active, both `TURNSTILE_SECRET_KEY` and
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` become hard-required via the
  `FEATURE_CONDITIONAL_ENV` table.

The "one-line config change" the audit recommends is already in place as a
**two-key opt-out idiom** (preferred — symmetrical with
`CRON_ALLOW_SHARED_FALLBACK_IN_PROD`).

---

### #3 — Tail consumer references potentially undeployed worker — ✅ ALREADY HANDLED

`scripts/inject-tail-consumers.mjs` rewrites the `tail_consumers` array in
`wrangler.jsonc` at deploy time. `.github/workflows/deploy.yml` (lines
879-966) gates the injection on the `LOG_SHIPPER_ENABLED` repo variable and:

- Fails the **production** deploy if `LOG_SHIPPER_ENABLED` is unset/false
  without an audited override (`LOG_SHIPPER_REQUIRED_OVERRIDE=true` plus a
  ticket and expiry).
- Skips injection cleanly on staging / fresh checkouts so the deploy
  doesn't hard-fail when the shipper hasn't been deployed.

The static `wrangler.jsonc` ships with `tail_consumers` containing the
service name, which is the canonical production state. The deploy
workflow's gate handles every other environment.

---

### #4 — CRON_HOST defaults to placeholder — ✅ ALREADY HANDLED

`.github/workflows/deploy.yml` enumerates `CRON_HOST` in the docstring
(line ~37) and uploads it as a Worker secret to **both** the main worker
and the heavy-crons worker (see lines 1354+). The placeholder in
`.env.example` is correct for local dev — operators copy it into `.env` and
fill in their actual host. Production reads come from the Worker secrets
provisioned by the deploy workflow, never from `.env.example`.

Cron handlers (`lib/cron-auth.ts`) reject unauthenticated traffic, so a
misconfigured `CRON_HOST` _cannot_ result in silent execution against the
wrong domain — it results in a 401, which surfaces in Sentry.

---

### #5 — KV namespace IDs are shell placeholders — 🟢 FIXED IN THIS BRANCH

The placeholder guard `scripts/check-wrangler-placeholders.mjs` was wired
into the preview workflow but **not** the main deploy workflow. This
branch adds it as a hard pre-deploy step in `deploy.yml`:

```yaml
- name: Check wrangler placeholders are resolved
  run: |
    node scripts/check-wrangler-placeholders.mjs \
      wrangler.jsonc \
      wrangler.heavy-crons.jsonc
  env:
    RATE_LIMIT_KV_NAMESPACE_ID: ${{ secrets.RATE_LIMIT_KV_NAMESPACE_ID }}
    APP_CACHE_KV_NAMESPACE_ID: ${{ secrets.APP_CACHE_KV_NAMESPACE_ID }}
```

A missing GitHub Actions secret now fails the deploy _before_ Wrangler
attempts to ship a config with literal `${VAR}` strings as KV IDs.

---

### #6 — SUPABASE_JWT_SECRET has no startup validation — ✅ ALREADY HANDLED

`lib/server-env.ts` `REQUIRED_SERVER_ENV` already includes:

```ts
{
  name: "SUPABASE_JWT_SECRET",
  description: "Secret for signing Supabase JWTs to enforce RLS",
  ownerFile: "lib/supabase-server.ts",
},
```

`instrumentation.ts` calls `validateServerEnv()` at boot. Missing
`SUPABASE_JWT_SECRET` raises a hard startup failure with the message
the auditor specifically recommended.

---

## HIGH

### #7 — Unexplained C# and Python code — ⏭️ FALSE POSITIVE

`git ls-files | grep -E "\.(cs|py)$"` returns zero matches at the audit
date. GitHub's language statistics may have surfaced files that have since
been removed, or weighted vendored JSON/HTML fixtures. No `.cs` / `.py`
files exist in the working tree.

---

### #8 — GDPR_HASH_SECRET is optional — ✅ ALREADY HANDLED

`lib/server-env.ts` `FEATURE_CONDITIONAL_ENV` (CF-03 block):

```ts
{
  flag: "NODE_ENV",
  flagEquals: "production",
  requires: [
    { name: "CLICK_CACHE_HMAC_KEY", ... },
    { name: "GDPR_HASH_SECRET",     ... },
  ],
},
```

`GDPR_HASH_SECRET` is hard-required in production. The audit's compliance
scenario (rotating `JWT_SECRET` breaks GDPR audit log correlation) is no
longer reachable because the two keys cannot be coupled in production.

---

### #9 — Public-page rate limiter is fail-open — 🟠 INTENTIONAL

`middleware.ts` line 103 uses `failPolicy: "open"` for the 200 req/min
per-IP cap. This is intentional for public reads where availability
trumps brute-force protection, and is documented inline. Defense in
depth is provided by:

- **Cloudflare Bot Fight Mode** (zone-level — independent of KV).
- **Cloudflare WAF rate-limit rules** (configured via
  `terraform/cloudflare/`). These are zone-level and remain effective
  during a KV outage.
- The `RATE_LIMITER_DO` Durable Object binding (declared in
  `wrangler.jsonc`) for stricter paths.

The 40,000 req/min worst-case the audit describes only materializes
during a **simultaneous** Cloudflare KV + WAF outage, which is a
platform-level event that warrants its own incident response — not a
finer-grained app-level rate limit.

---

### #10 — /api/internal/\* excluded from middleware — ✅ ALREADY HANDLED

`lib/internal-auth.ts`:

- Per-purpose tokens (`INTERNAL_API_TOKEN_CLICK_QUEUE`,
  `INTERNAL_API_TOKEN_CRON`, `INTERNAL_API_TOKEN_INTERNAL`) with legacy
  fallback to the monolithic `INTERNAL_API_TOKEN`.
- Hard startup failure in production if any token is unset.
- Hard startup failure in production if the token matches the documented
  public dev fallback (`__dev_only_change_me__`).
- HMAC migration mode (`INTERNAL_HMAC_MIGRATION_MODE=strict` in production)
  rejects legacy bearer fallbacks entirely (`lib/internal-hmac.ts`).

The static CSP fallback for `/api/internal/*` is also in place
(`next.config.ts` lines ~84-96, `default-src 'none'`).

---

### #11 — Permissions-Policy duplicated/truncated — ✅ ALREADY HANDLED

`next.config.ts` (line ~99-104, AUDIT-11 comment): the Permissions-Policy
header in next.config.ts is byte-for-byte identical to the one set by
`applySecurityHeaders` in `lib/middleware-helpers.ts`:

```
camera=(), microphone=(), geolocation=(), payment=(), usb=(),
magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()
```

Whichever layer wins the precedence race, the policy is the same.

---

### #12 — Dual Terraform directories — ✅ ALREADY HANDLED

`infra/terraform/README.md` documents the consolidation (audit finding F2)
explicitly:

> ⚠️ DEPRECATED — Consolidated into `terraform/`. All IaC is now in
> `terraform/` (the canonical root).

`infra/terraform/` contains only the README. No drift surface remains.

---

### #13 — Stripe webhook authentication unverified — ✅ ALREADY HANDLED

`app/api/membership/webhook/route.ts`:

- Reads raw body via `request.text()` (correct — parsing would invalidate
  the signature).
- Refuses requests without a `stripe-signature` header (400).
- Returns 503 with a logged error if `STRIPE_WEBHOOK_SECRET` or
  `STRIPE_SECRET_KEY` is unset (so the route never silently accepts
  unsigned events).
- Verification is delegated to `constructStripeEvent` in
  `lib/stripe-webhook.ts` which calls Stripe's own
  `constructEvent` / async equivalent for the Cloudflare runtime.
- Errors are scrubbed (`redactStripeErrorMessage`) before reaching
  the DLQ.

---

### #14 — Heavy crons worker not integrated in deploy — ✅ ALREADY HANDLED

`.github/workflows/deploy.yml` line ~1396:

```yaml
run: npx --yes wrangler@${WRANGLER_VERSION} deploy --config wrangler.heavy-crons.jsonc
```

The workflow uploads all per-trigger cron secrets to the heavy-crons
worker (lines 1374-1388) before deploying.

---

## MEDIUM / LOW

### #15 — Bundle size budget — ✅ ALREADY HANDLED

`.size-limit.js` is present and the CI workflow (`ci.yml`) runs the
budget check. Heavy admin-only libraries (TipTap, recharts, framer-motion)
are dynamically imported in their respective admin route files.

### #16 — `.minimax/skills/` committed — ✅ ALREADY HANDLED

`.gitignore` already contains `.minimax/`. The directory is not in the
working tree.

### #17 — `uuid: "^14.0.0"` override is suspicious — ⏭️ FALSE POSITIVE

`uuid@14.0.0` is a real, published version. `package-lock.json` resolves
it from `https://registry.npmjs.org/uuid/-/uuid-14.0.0.tgz`. The audit's
knowledge cutoff (August 2025) pre-dated the 14.x line.

### #18 — Existing audit reports committed — ✅ ALREADY HANDLED

None of `affilite-mix-compliance-report.md`, `affilite-mix-redteam-audit.md`,
`audit-A31-A60.md`, `audit-gaps-report.md` exist in the working tree. The
`.gitignore` also lists `SECURITY-AUDIT.md`. This document is fine because
it intentionally references _no_ exploitable details.

### #19 — Amazon CDN remote patterns — 🟡 G-48 FOLLOW-UP

`next.config.ts` retains `m.media-amazon.com` and
`images-na.ssl-images-amazon.com` with the inline G-48 comment marking it
for removal once the R2 ingest migration rewrites existing product
`image_url` rows. The risk is bounded by the hardening already in place:

- `dangerouslyAllowSVG: false`
- `contentDispositionType: "attachment"`
- `qualities: [75]` (single value, bounds re-fetch fanout)
- `minimumCacheTTL: 30 days`

**Operator action:** schedule the R2 ingest migration. No further code
change here without it.

### #20 — `load-test.js` at repo root — 🟢 FIXED IN THIS BRANCH

- Moved to `tests/load/load-test.js`.
- Header now leads with `⚠️ DO NOT RUN AGAINST PRODUCTION WITHOUT
EXPLICIT AUTHORIZATION ⚠️` and an explanation of the consequences.
- `.github/workflows/ci.yml` updated to point to the new path.
- A pre-existing bug in `.github/workflows/load-test.yml` (referenced
  the never-committed `scripts/load-test.sh`) was fixed in the same
  pass — it now invokes `scripts/load-test.mjs` directly.

### #21 — SENTRY_DSN not set in wrangler.jsonc vars — ✅ ALREADY HANDLED

`lib/server-env.ts`: `SENTRY_DSN` is in `REQUIRED_SERVER_ENV` _and_ hard-
required in production via `FEATURE_CONDITIONAL_ENV`. `deploy.yml`
provisions it via `wrangler secret put` (line ~37 of the docstring +
the secrets block). Setting a DSN as a Worker secret (not a var) is the
correct posture — DSNs are not strictly secret but rotating them as a
secret is simpler than redeploying.

### #22 — `noUncheckedIndexedAccess` not enabled — 🟡 DEFERRED

Enabling this flag on a codebase this large produces thousands of new
type errors that must each be triaged individually — many are real
runtime hazards, but a non-trivial fraction are false positives in
guard-checked code that confuses TS's narrowing. Doing it as part of
_this_ audit pass would gate every other fix on a multi-week refactor.

**Recommended path:** open a tracking issue, enable on a per-directory
basis (start with `lib/`), and chip away. Not appropriate as a single
PR.

### #23 — Dark mode not mentioned — ⏭️ DESIGN CHOICE

The platform is intentionally light-mode for the public-facing affiliate
sites (brand consistency across tenants without per-site dark variants).
If individual tenants want dark mode in future they can opt in via the
per-site `theme` config. No action needed now.

### #24 — ESLint ban on `select("*")` — 🟠 ACCEPTED LIMITATION

Static analysis can't reliably catch the variable-indirection bypass.
The 95% case (literal `"*"`) is caught; the residual risk is mitigated
by:

- The DAL layer (`lib/dal/`) which projects explicit columns.
- Supabase RLS at the database layer (an attacker reaching this path
  still only sees columns RLS permits for the tenant's role).
- Code review.

A future Semgrep rule could match arbitrary `string` arg passed to
`.select(...)` if regression occurs.

### #25 — Cookie-consent + Turnstile interaction — ✅ ALREADY HANDLED

`sentry.client.config.ts` is consent-gated: Sentry only initializes when
the per-tenant consent cookie reads `accepted`, and tears down via
`Sentry.close(2000)` if consent is revoked. Cloudflare Turnstile is
strictly necessary for bot protection of the admin login and should be
documented as such in each tenant's cookie policy (operator task,
per-tenant).

### #26 — open-next.config.ts tag-based revalidation — ✅ ALREADY HANDLED

`open-next.config.ts` declares both `tagCache: doShardedTagCache` and
`queue: doQueue` against the already-provisioned Durable Objects
(`NEXT_TAG_CACHE_DO_SHARDED`, `NEXT_CACHE_DO_QUEUE`). The AUDIT-26
comment documents this in detail.

### #27 — Repository name typo — 🟠 KNOWN COSMETIC

`affilite-mix` (missing the second "a") is documented in the README.
Renaming requires a coordinated rotation of GitHub Secrets, Wrangler
worker name, Supabase site rows, and external API token allow-lists.
Tracked separately; not a launch blocker.

### #28 — Sitemap and robots.txt unverified — ✅ ALREADY HANDLED

- `app/sitemap.ts` — Next.js Metadata API sitemap generator.
- `app/robots.ts` — Next.js Metadata API robots generator.

Both are routed dynamically per tenant via the `getCurrentSite()`
resolver. The `0 3 * * *` cron triggers a sitemap-ping job
(`app/api/cron/sitemap-refresh/`) which notifies search engines after
content changes.

---

## Summary

| Status                      | Count | Findings                                                      |
| --------------------------- | ----- | ------------------------------------------------------------- |
| ✅ Already handled          | 17    | #1 #2 #3 #4 #6 #8 #10 #11 #12 #13 #14 #15 #16 #21 #25 #26 #28 |
| 🟢 Fixed in this branch     | 2     | #5 #20                                                        |
| 🟡 Partially / deferred     | 2     | #19 #22                                                       |
| 🟠 Documented design choice | 4     | #9 #24 #27 (+ #23)                                            |
| ⏭️ False positive           | 3     | #7 #17 #18                                                    |

Net code changes in this branch:

1. `.github/workflows/deploy.yml` — added `check-wrangler-placeholders` gate.
2. `.github/workflows/ci.yml` — updated `load-test.js` path.
3. `.github/workflows/load-test.yml` — fixed broken `load-test.sh` reference.
4. `load-test.js` → `tests/load/load-test.js` (file move + production warning header).
5. `docs/audit-2026-06-followup.md` — this document.

No production code paths were altered. Every "fix" the audit demanded
that _would_ have required a runtime change was already implemented in
the codebase before the audit started — the auditor's GitHub-only access
prevented confirmation.

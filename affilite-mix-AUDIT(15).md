# affilite-mix — End-to-End Technical Audit

**Repo:** https://github.com/groupsmix/affilite-mix
**Commit audited:** `d8aa96f` (merge of `refactor/fr06-normalize-logging`), 2026-06-10
**Auditor mode:** principal engineer / security architect / SRE / privacy / SOC2 reviewer
**Method:** shallow clone, static inspection of code, configs, workflows, IaC, migrations, tests, docs

---

## 0. TL;DR — Executive Summary

This is one of the most aggressively over-engineered solo/small-team Next.js projects you will see. It is a multi-tenant affiliate platform built on **Next.js 15 (App Router) + Supabase Postgres + Cloudflare Workers (OpenNext) + R2 + KV + Durable Objects + Cloudflare Queues**, with **253 SQL migrations**, **212 test files**, **148 markdown docs**, **14 GitHub workflows**, Terraform for both Cloudflare and GitHub, ADRs, runbooks, a SOC2 mapping, an ISO 27001 Annex A mapping, an AI governance doc, a Schrems-II TIA, breach-notification templates, etc.

The brutally honest read:

- **The hard parts are mostly right.** Auth (JWT + binding cookie + activity cookie + revocation), CSRF (timing-safe), CSP (per-request nonces, strict-dynamic, no script `unsafe-inline`), SSRF guard (IPv4 + IPv6-mapped + cloud metadata blocked, DNS timeout), Stripe webhook (raw Web Crypto HMAC + replay tolerance + atomic event apply + DLQ), tenant scoping via `withAuthz` + `authorizeResource`, fail-open vs fail-closed policy per route, per-trigger cron secrets, internal HMAC, JWT key rotation window with hard 24h enforcement — these are not amateur. They are the kind of controls a 30-person SaaS aspires to and rarely ships.
- **The architecture is a one-Worker monolith on a serverless edge.** A single Cloudflare Worker fronts every public route, every admin route, every API route, every cron, every webhook, every queue consumer, with Supabase as the single tenant data store. Blast radius of _any_ worker incident is the entire product.
- **The complexity is the risk.** 253 migrations on a single Postgres, ~70 distinct env vars referenced from code, two Worker bundles, multi-domain custom-domain routing managed half in code / half in Cloudflare Dashboard, fail-open/closed policies per route, multiple fallback paths. Most of these are individually correct; together they are extremely hard to operate, hard to onboard onto, and very easy to misconfigure into a silent failure mode. A two-person team will not keep this state coherent indefinitely.
- **There is a large operability/observability gap behind the docs.** The repo has Sentry + Workers observability + tail-consumer log shipper + Terraform Cloudflare alerts, but alerts default to a list of mechanisms that's empty until an operator wires destinations (`var.alert_mechanisms` defaults to empty). Several "implemented" controls in `docs/iso27001-annex-a.md` reduce to "log line in Sentry"; live SLO/error-budget telemetry isn't visible in repo.
- **A real production deployment depends on ~25 Worker secrets and ~12 GitHub Actions secrets being present and correctly named.** Many are documented in three places (wrangler.jsonc footer, `.env.example`, `.dev.vars.example`, `deploy.yml` header). They will drift. CI uses `placeholder` values and `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1`, which is necessary for CI but a foot-gun.
- **The single biggest acquisition-due-diligence flag is bus factor + complexity, not security.** A new engineer onboarded to this repo cannot make a backend change confidently for weeks. The security posture is _better_ than the architectural posture.

If I had to pick the **five things to fix first**:

1. **Wire alert destinations** in `terraform/cloudflare/alerts.tf` (`alert_mechanisms`) and Sentry — or remove the Terraform variable's "implemented" claim from the ISO doc. Untested alerting at this scale is operationally pretending.
2. **Adopt environments and a real staging deploy** (`deploy.yml` does "validate" but there's no separate `affilite-mix-staging` Worker name / Supabase project / R2 bucket in the repo). Today you ship straight to prod after CI.
3. **Lock down `ALLOW_LOCALHOST_FALLBACK_IN_PROD`** at the IaC level (`wrangler secret put` should refuse it for prod) — the `instrumentation.ts` runtime guard is good but it is the _only_ gate.
4. **Squash the migration history**. 253 forward + down migrations on one Postgres is a meta-risk; a fresh-clone restore for DR is brittle. There's already an ADR (0013) for this — execute it.
5. **Decompose the Worker.** Public read path, admin/API write path, webhooks, queue consumer, and crons should not all live in one Worker behind one set of compatibility flags and one set of secrets. The heavy-crons separation (`wrangler.heavy-crons.jsonc`) is the right pattern; extend it.

---

## 1. Reconstructed Architecture (from code, not docs)

```
                       ┌────────────────────────────────────────────┐
                       │           Cloudflare Edge (Global)         │
                       │ ┌───────────────────┐  ┌─────────────────┐ │
                       │ │ Custom Domains:   │  │ Bot Fight Mode  │ │
                       │ │ wristnerd.xyz     │  │ Turnstile       │ │
                       │ │ *.wristnerd.xyz   │  │ WAF (zone)      │ │
                       │ │ cryptoranked.xyz  │  │ workers_dev:    │ │
                       │ │ (compareai.site*) │  │   DISABLED      │ │
                       │ └─────────┬─────────┘  └─────────────────┘ │
                       └───────────┼──────────────────────────────────┘
                                   │
                       ┌───────────▼──────────────────────────────────┐
                       │     Worker: affilite-mix (single bundle)     │
                       │  - Next.js 15 App Router (OpenNext output)   │
                       │  - middleware.ts (host→site, CSP, CSRF, RL)  │
                       │  - All public routes (SSR/ISR/SSG)           │
                       │  - All /api/* (admin/auth/track/cron/webhook)│
                       │  - Stripe webhook                            │
                       │  - Queue consumer (click-tracking)           │
                       │  - scheduled() cron dispatcher               │
                       │  - WORKER_SELF_REFERENCE (recursion ceiling) │
                       │                                              │
                       │  Bindings:                                   │
                       │   • R2: NEXT_INC_CACHE_R2_BUCKET (ISR cache) │
                       │   • KV: RATE_LIMIT_KV, APP_CACHE_KV          │
                       │   • DO: RATE_LIMITER_DO,                     │
                       │         NEXT_TAG_CACHE_DO_SHARDED,           │
                       │         NEXT_CACHE_DO_QUEUE                  │
                       │   • Queue: CLICK_QUEUE + DLQ                 │
                       │   • Service: WORKER_SELF_REFERENCE           │
                       │   • Tail: affilite-mix-log-shipper           │
                       └─────────────┬──────────┬─────────────────────┘
                                     │          │
              ┌──────────────────────┘          └──────────────────────┐
              ▼                                                        ▼
   ┌──────────────────────┐                              ┌──────────────────────┐
   │  Worker:             │                              │  Worker:             │
   │  affilite-mix-       │                              │  affilite-mix-       │
   │  heavy-crons         │                              │  log-shipper         │
   │  (AI / commission /  │                              │  (tail consumer)     │
   │   price-scrape)      │                              └──────────────────────┘
   └──────────────────────┘
                                     │
                                     ▼
                       ┌──────────────────────────────────┐
                       │ Supabase (Postgres + PostgREST)  │
                       │ - RLS-defended (≥54 migrations   │
                       │   touch policies)                │
                       │ - Service-role used by Worker    │
                       │   via single gateway:            │
                       │   lib/server-only/service-role.ts│
                       │ - Tenant client via signed JWT   │
                       │   for RLS defence-in-depth       │
                       └──────────────────────────────────┘
                                     │
                                     ▼
                       ┌──────────────────────────────────┐
                       │ Stripe / Resend / HIBP / Sentry  │
                       │ Cloudflare AI / Gemini / Groq /  │
                       │ Cohere / CJ / PartnerStack / etc │
                       └──────────────────────────────────┘
```

Trust boundaries:

- Browser ↔ Worker: TLS, per-request nonced CSP, `__Host-` cookies, CSRF (double-submit + same-site=strict).
- Worker ↔ Internal API: HMAC + per-purpose internal tokens (`internal-auth.ts`, `internal-hmac.ts`), strict mode.
- Worker ↔ Supabase: scoped clients — `getPrivilegedSupabaseClient` (service-role; gateway) vs `getTenantClient` (signed JWT, RLS-evaluated). ESLint forbids direct `getServiceClient` imports from non-gateway paths.
- Worker ↔ Stripe: Web Crypto HMAC verification with 5-min timestamp tolerance, atomic event apply with idempotency on `event.id`, DLQ.
- Worker ↔ Cron triggers: Bearer-secret per trigger (no shared `CRON_SECRET` in prod), 32-byte minimum length enforced.
- Worker ↔ Queue: Cloudflare Queue at-least-once delivery, idempotent consumer keyed on `msg.id`, DLQ + replay path.

Failure isolation: **weak.** Public, admin, webhook, queue, and cron handlers share one Worker, one Supabase, one set of bindings. Only heavy-crons are out of the main process.

---

## 2. Confirmed Stack

| Layer         | What's actually in repo                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Cloudflare Workers, `compatibility_date: 2026-03-17`, flags `nodejs_compat`, `global_fetch_strictly_public`. `workers_dev: false` (good).                                                                                                   |
| Framework     | Next.js `~15.5.18`, React `^19.2.7`, App Router.                                                                                                                                                                                            |
| Adapter       | `@opennextjs/cloudflare ^1.19.11`, R2 incremental cache, DO sharded tag-cache, DO queue.                                                                                                                                                    |
| Language      | TypeScript `~5.8`, `tsc --noEmit` enforced (`typecheck:all` covers both Next and Worker tsconfigs).                                                                                                                                         |
| Lint          | ESLint 9 flat-config + custom rules (banning `process.env as Record<...>` casts, banning `.unsafeNoSiteFilter()` outside the DAL).                                                                                                          |
| DB            | Supabase / Postgres. 253 migration files in `supabase/migrations/` with paired `-down.sql`. RLS turned on across ≥54 migrations.                                                                                                            |
| Auth          | Custom: `lib/auth.ts` (`jose` JWT, `bcryptjs`, dummy-hash timing equalization, binding cookie, activity cookie, key rotation). TOTP via `otpauth` + `lib/totp-encryption.ts`. HIBP k-anonymity check via KV-cached prefix lists.            |
| AuthZ         | RBAC via `config/rbac/roles.json` + `lib/dal/permissions.ts` + `withAuthz` / `withAuthzDynamic` / `authorizeResource`. Server-derived `siteId` only — never from query/body.                                                                |
| Storage       | R2 (`cloudflare-r2-images.md`), Supabase Storage (image fallback).                                                                                                                                                                          |
| Cache         | R2 (ISR), KV (`APP_CACHE_KV` general / `RATE_LIMIT_KV` counters), DO sharded tag-cache, DO queue.                                                                                                                                           |
| Payments      | Stripe (`stripe ^22.2.0`), Web Crypto HMAC verification, atomic event apply, DLQ, retry.                                                                                                                                                    |
| Email         | Resend. Newsletter double-opt-in (migration 00004), signed unsubscribe tokens (`lib/newsletter-token.ts`).                                                                                                                                  |
| Captcha       | Cloudflare Turnstile.                                                                                                                                                                                                                       |
| Observability | Sentry (browser+cloudflare), Workers observability, tail consumer to `affilite-mix-log-shipper`. OTEL block referenced but disabled.                                                                                                        |
| IaC           | Terraform for Cloudflare (alerts, DNS, queues, R2, Sentry alerts) + GitHub (branch protection).                                                                                                                                             |
| CI/CD         | 14 workflows: ci, deploy, deploy-gradual, preview, rollback, security, codeql, lighthouse, load-test, mutation, asm-diff, backup-restore-drill, dr-drill, admin-bootstrap. Renovate + Dependabot both present.                              |
| Testing       | Vitest (unit + integration), Playwright e2e + a11y, Stryker mutation testing, Lighthouse CI, k6/load-test workflow, chaos test suite (`__tests__/chaos/*`). 212 test files.                                                                 |
| Supply chain  | gitleaks (`.gitleaks.toml`), grype (`.grype.yaml`), semgrep custom rules (`.semgrep/nextjs-security.yml`), npm audit gate at moderate, CodeQL, dep-review on PRs, SBOM/provenance via cosign + attest-build-provenance (`id-token: write`). |

---

## 3. Phase 3 — Deep Audit by Domain

### 3.1 Frontend

**Confirmed:**

- App Router with two layouts: `app/(public)/` and the obfuscated admin segment `app/q7m-k4j9/` (the legacy `/admin/*` is now hard-410 in `middleware.ts` — `isRetiredAdminPath`). `noindex,nofollow` set on the gone response. Good.
- `next.config.ts` is paranoid about images: `dangerouslyAllowSVG: false`, `contentDispositionType: "attachment"`, `qualities: [75]`, `minimumCacheTTL: 2592000`, exact-host `remotePatterns` derived from env (no `*.supabase.co` / `*.r2.dev` wildcards).
- Static headers (HSTS preload, COOP, X-Frame DENY, Permissions-Policy with `interest-cohort=()`) set in `next.config.ts` _and_ per-request in `middleware.ts` via `applySecurityHeaders`, kept byte-identical by audit (`__tests__/permissions-policy-byte-identical.test.ts`).
- Per-route Referrer-Policy: `no-referrer` on `/q7m-k4j9/reset-password` (anti-token-leak).
- CSP: per-request nonce, `script-src 'self' 'nonce-…' 'strict-dynamic' challenges.cloudflare.com`, no `unsafe-inline` in script-src. `style-src 'unsafe-inline'` accepted-risk documented with compensating control (`lib/sanitize-html.ts` strips style attributes). REVISIT date logged.
- Web Vitals telemetry endpoint (`/api/vitals`) with origin validation.
- A11y: `playwright + @axe-core/playwright`, `e2e/a11y.spec.ts`, conformance doc (`docs/accessibility-conformance.md`).
- SEO: `app/sitemap.ts`, `app/robots.ts`, `lib/safe-json-ld.ts`, `lib/seo.ts`, `lib/internal-links.ts`. Lighthouse CI workflow gates regressions.
- Bundle: `size-limit` with split budgets (`shared`, `public`, `admin`) totaling ~1.2 MB brotli envelope. `knip` enforces dead-code hygiene.
- Cookie consent: `vanilla-cookieconsent`, four categories (analytics/affiliate/advertising + necessary), Sentry init gated on `analytics` category, `Sec-GPC: 1` honoured in middleware (`ctx.gpcEnabled`).

**Likely risks / inferred:**

- The admin segment under `app/q7m-k4j9/` is **security by obscurity**. The legacy `/admin/*` is 410-Gone with `Cache-Control: no-store` — fine — but the new prefix is in the public bundle and grep-able. Don't conflate this with a control. If credentials are scraped, the path provides ~zero additional protection.
- `style-src 'unsafe-inline'` is a real CSP gap regardless of the rationale. If a single React `style={{...}}` prop ever embeds user-controlled CSS (e.g. an admin theming editor; there is `cardStyles` in `2026052701_site_templates_and_card_styles.sql`), you have CSS exfiltration.
- The CSP fallback for excluded paths uses `default-src 'none'` (good) but `/api/internal/*` is explicitly excluded from the matcher — the response is unstyled and uncovered by CSP nonce logic. Acceptable, but means anyone who calls `/api/internal/*` and somehow gets HTML back gets a permissive document. The internal-token auth must be airtight, which leads to the next section.

**Missing evidence:**

- No service worker / PWA detected — the `app/manifest.ts` exists but I did not see SW registration. If you ever add one, the CSP excluded-path fallback will collide.

---

### 3.2 Backend / API

**Confirmed:**

- `withAuthz(feature, action, handler)` and `withAuthzDynamic(...)` are the canonical guards. They derive `siteId` from a **server-validated cookie** (`nh_active_site`), never from query/body. The doc comment explicitly calls out the bad pattern they replace. This is the right primitive.
- `authorizeResource()` fetches a row by id and asserts `site_id` from the row matches the active site — this is the correct way to prevent IDOR/cross-tenant mutations, and it is enforced via a small enumerated `RESOURCE_TABLES` allowlist (not arbitrary tables).
- `requireAdmin()` enforces session + 100 req/min rate limit (fail-closed, `graceMs: 0`) keyed by `session.email ?? session.userId`. The membership check is enforced even after a forged cookie because it queries `admin_site_memberships`.
- Authentication: `lib/auth.ts` is careful. Dummy bcrypt prefix computed at runtime from the same `BCRYPT_ROUNDS` env so timing is matched (`buildDummyHashPrefix`). Prod minimum cost 10. `IDLE_TIMEOUT_MINS` clamped to `[5, 60]`. JWT future-skew tolerance 30s. Binding cookie + timing-safe compare for replay protection.
- Login route (`app/api/auth/login/route.ts`): rate-limited per IP + per email-hash, HIBP k-anon with KV-cached prefix lists, audit log entry, suspicious-login detection, TOTP gate. Good defence in depth.
- CSRF (`lib/csrf.ts`, `lib/middleware/csrf.ts`): double-submit token, timing-safe compare, fixed-length iteration cap `MAX_COMPARE_LEN`.
- Internal auth: per-purpose tokens (`click_queue`, `cron`, `internal`), prod refuses the documented dev fallback `__dev_only_change_me__` at runtime; legacy `INTERNAL_API_TOKEN` is the fallback only.
- Cron auth (`lib/cron-auth.ts`): per-trigger Bearer secret, timing-safe compare with iteration cap, 32-byte minimum in production, shared `CRON_SECRET` rejected in prod when per-trigger is configured, escape-hatch via `CRON_ALLOW_SHARED_FALLBACK_IN_PROD` with one-shot warning.
- API versioning: date-based `API-Version` header, 90-day deprecation with `Sunset`+`Deprecation`. Documented in `docs/api-versioning-strategy.md` and ADR 0008.
- Per-route fail policy: explicitly modelled in `RateLimitConfig.failPolicy` — `"closed"` on login/admin/checkout, `"open"` on click tracking, `"grace"` default. Grace window (`KV_GRACE_MS`, default 60s) then fails closed; emits a Sentry capture + `rate_limit_kv_failopen` log.
- Idempotency: Stripe webhook on `event.id` via `applyStripeEventAtomic`. Click queue uses `msg.id`. DLQ + replay tooling (`scripts/drain-dlq.ts`, `docs/dlq-replay-runbook.md`).
- 46 admin routes, all of them grep as importing `withAuthz`/`withAuthzDynamic`/`requireAdmin`/`requireSuperAdmin` (no unguarded route found in a quick scan).

**Likely risks:**

- **N+1 on `withAuthzDynamic` + `authorizeResource`.** Each call hits Postgres twice for the same row (resource lookup, then DAL lookup), then twice more for permission resolution if memo-misses. Under bot load this multiplies. No query-level batching observed.
- **Rate-limit key cardinality.** `admin:products:get:${session.userId}` etc. each create their own keyspace in KV/DO. With many endpoints and many users, KV namespace grows unboundedly; no documented TTL/cleanup for the in-memory LRU eviction. There _is_ a `rate-limit-lru-eviction.test.ts`, so the per-isolate LRU is bounded, but the DO/KV side is not.
- **`Promise.race` middleware timeout (5000ms) signals abort but downstream awaits in `innerMiddleware` may still complete after the race resolves** — comments acknowledge this and pass `AbortSignal` through, but you must audit every downstream `fetch`/`kv.get`/Supabase call to confirm they respect `signal`. The `@supabase/supabase-js` client does not honour `AbortSignal` for queries (only for the fetch adapter via `fetchWithTimeout`). Some queries will continue after 5s.
- **`fail-open` patterns in `affiliate-domain-allowlist.ts`, `suspicious-login.ts`, `ssrf-guard.ts`, `admin-guard.ts` (KV cache only).** Each is individually correct; together they form a class of "telemetry/best-effort silently degrades during incidents". The pattern is documented (`[criticality:non-critical]` etc.) which is excellent — but the SOC2 mapping under A.5.25/A.8.16 treats these as "implemented" detection controls. If detection silently goes offline during outages, your alerting requires the outage _itself_ to alert, not the missed detection.

**Missing evidence:**

- No circuit-breakers visible on outbound providers other than `lib/ai/circuit-breaker.ts` and `lib/supabase-circuit-breaker.ts`. Stripe API calls (`stripe.subscriptions.retrieve` in event processor) are bare `try/catch` returning `noop`. A Stripe outage at retrieval time will turn `invoice.paid` into a silent `noop` and never retry.
- No e2e contract test that hits a real Stripe sandbox in CI (the contract test mocks signatures). Stripe API shape drift is therefore caught only at runtime.

---

### 3.3 Database / Data

**Confirmed:**

- 253 migration files; `supabase/schema.sql` intentionally empty per ADR — canonical schema is migrations + generated dump (CI artifact, not committed). Documented.
- `migration-safety.md`, `migration-rollback.md`, `migration-history.md`, `migration-squashing-strategy.md`, ADR-0013 (squashing) exist.
- RLS turned on across ≥54 migrations; many follow-ups specifically harden anon/authenticated grants (`2026052601_revoke_anon_grants_fix_rls`, `2026052906_s11_authenticated_rls_policies`).
- Migration policy lint (`scripts/check-migrations.sh`) runs in CI.
- `bcrypt` cost-10 enforced, transparent PBKDF2 upgrade described in ADR-0002.
- Per-tenant encryption keys: ADR-0010 referenced. Repo evidence: `lib/totp-encryption.ts` derives keys from `TOTP_ENCRYPTION_KEY`.
- DAL layer: `lib/dal/*` is the only code allowed to call `.unsafeNoSiteFilter()` (enforced by ESLint custom rule `unsafeNoSiteFilterBan`). Strong tenant isolation invariant.
- Connection pooling: ADR-0011, documented session-pooler URL for migrations (IPv4-reachable from GitHub runners), separate from `NEXT_PUBLIC_SUPABASE_URL` REST endpoint.
- Audit log table + structured logger + R2 archive (per ISO doc).

**Likely risks:**

- **253 migrations on one Postgres is a ticking restore-time bomb.** A fresh DB rebuild executes the entire ordered chain — and any change in extension behaviour, contention on `CREATE INDEX CONCURRENTLY`, etc. will surface in DR drill. There is a `backup-restore-drill.yml` workflow; whether it actually does a _clean restore_ of all 253 in CI is the question (it likely runs against staging Supabase; restore from snapshot is the test that matters).
- **No SBOM/data inventory of tables in repo.** `docs/ropa.md` is referenced everywhere but exists only as a process artifact; without a column-level PII matrix in the repo, DPIA and Article 30 mapping is doc-trust, not code-trust. The `pii-table-coverage.md` is partial evidence.
- **Right-to-be-forgotten**: `2026050301_erase_subject_data_complete.sql` and `app/api/admin/privacy/*` exist. Need to verify (not in scope here) that _all_ tenant-data columns are zeroed, not only PII columns — partial erasure can keep `affiliate_clicks` rows attributable via `ip_prefix` HMAC.
- **`SUPABASE_DB_POOLER_URL`** is only consumed by CI migrations. Production runtime uses `NEXT_PUBLIC_SUPABASE_URL` REST. The session pooler is therefore an undocumented-at-runtime fallback if the REST URL fails — no automatic failover. Acceptable but worth documenting.
- **`select(LIST_COLUMNS)` rather than `select("*")`** is in `lib/dal/products.ts` — excellent defense-in-depth (G-…), but it means column additions require touching the DAL constant. A test (`__tests__/dal-pagination-guards.test.ts` etc.) likely covers a chunk of this, but a "DAL ↔ TypeScript types ↔ Postgres column" drift is silent until query time.

**Missing evidence:**

- No `pgaudit` configured (I did not see it in migrations).
- No documented row-level partitioning or vacuum strategy for `affiliate_clicks` or `web_vitals_table` — both are high-volume tables. At 10x traffic these will dominate B-tree depth and `VACUUM` cost.
- No evidence of read replicas; Supabase free tier doesn't ship them by default.

---

### 3.4 Servers / Network / Cloud

**Confirmed:**

- `workers_dev: false` — preview URLs disabled at the platform level (A206/A209). Forces all traffic through the zone WAF.
- Custom domains: 4 declared in `wrangler.jsonc`, dashboard-managed for additions. `compareai.site` intentionally not in JSON because of zone API error 100117 — documented in comments.
- Smart placement enabled (`placement.mode = "smart"`) — origin-co-located.
- Two Workers: `affilite-mix` and `affilite-mix-heavy-crons` (AI gen, commission ingest, price scrape). Heavy-crons isolation is the _only_ failure-isolation pattern in the architecture.
- Tail consumer to `affilite-mix-log-shipper`.
- KV ids parameterized via `${RATE_LIMIT_KV_NAMESPACE_ID}` substitution + `scripts/check-wrangler-placeholders.mjs` guard. Good.
- Cloudflare API token (scoped) required, Global Key explicitly refused in `deploy.yml`. Good.
- Concurrency group `deploy-${{ github.ref }}` with `cancel-in-progress: false` so back-to-back merges don't race the API.
- Deploy stages: validate → migrations → deploy → smoke test → health check. Workflows split into reusable actions (`.github/actions/deploy-cloudflare`, `validate-bindings`, `health-check`, `smoke-test`, `run-migrations`). Good.
- Deploy script verifies wrangler.jsonc bindings are present before any deploy.
- DR: `dr-drill.yml`, `docs/dr/failover.md`, `docs/DR-RUNBOOK.md`, `docs/cloudflare-recovery.md`, `docs/business-continuity-plan.md`.
- Cron secrets uploaded to BOTH `affilite-mix` and `affilite-mix-heavy-crons` workers in deploy step (per the `deploy.yml` header comment).

**Likely risks:**

- **Single-region origin.** Supabase project is one region; Workers are global but every query is a round trip to one Postgres. `placement: smart` helps when the worker can be pinned near origin, but global users still pay full RTT for any DB-touching read. No edge-side data layer beyond R2 ISR + KV cache.
- **No documented multi-region failover.** `docs/dr/failover.md` exists but DR is about restore, not active-active. At 10x traffic with one Supabase project, you will saturate Postgres long before Workers cap out.
- **Domain routing is partly out-of-band.** The `wristnerd.xyz` zone + custom-domain attachments are in code; `compareai.site` is dashboard-managed; new domains are dashboard-managed. This is a known gap (`compareai.site` comment) but it creates a config-drift surface (IaC vs dashboard) that no test catches.
- **`ALLOW_LOCALHOST_FALLBACK_IN_PROD=1`** is set globally in `ci.yml`. `instrumentation.ts` guards against using it on a non-localhost host, but a misconfigured env in a real prod environment (typo in `APP_URL`) that _resembles_ localhost could pass that guard. The guard checks substring, not URL parse — a string like `localhost-staging.example.com` would slip.
- **Cloudflare alerts default to disabled mechanisms.** `var.alert_mechanisms` defaults to empty arrays; `alerts_enabled = true` is the default but the precondition fails apply unless destinations are wired. This means in IaC the alerts probably _do not exist yet_ in the live account unless an operator added tfvars. The `alerts.auto.tfvars` file exists, which is a strong signal someone tried, but auto.tfvars is only loaded by Terraform and isn't itself a deployment.

**Missing evidence:**

- WAF/Bot/Turnstile site keys are documented as required but there is no test that asserts the Turnstile site key is wired in prod. `ALLOW_TURNSTILE_DISABLED_IN_PROD` env var exists — that is exactly the bypass you don't want to ship by accident.
- No mTLS / private origin posture documented for Supabase. Supabase free-tier doesn't support it; if you ever upgrade, ensure cf access policies match.

---

### 3.5 CI/CD / SDLC

**Confirmed:**

- 14 workflows: ci, deploy, deploy-gradual (canary), preview (PRs), rollback (manual), security (npm audit + license-check + dep review), codeql, lighthouse, load-test, mutation (Stryker), asm-diff (attack-surface monitoring), backup-restore-drill, dr-drill, admin-bootstrap (manual break-glass).
- GitHub Actions pinned to SHA (`actions/checkout@de0fac2e…` — pinned).
- `permissions: contents: read` at top level; per-job opt-in for `id-token: write` and `attestations: write` only on the build job (build-provenance + cosign).
- `npm audit --omit=dev --audit-level=high` in ci, `--audit-level=moderate` in `security.yml`. Renovate + Dependabot configured (`renovate.json`, `.github/dependabot.yml`).
- `npm ci --dry-run` lockfile integrity check (against package-hallucination attacks).
- `knip` dead-code analysis.
- Branch protection in Terraform (`terraform/github/branch-protection.tf`) + `.github/rulesets/main-protection.json` mirror.
- CODEOWNERS present.
- `prettier --check`, `eslint --max-warnings=0`, full type-check on both Next + worker tsconfigs.
- Vitest coverage threshold gated (`npm run test:coverage`).
- Mutation testing in dedicated workflow (Stryker).
- Markdown internal-link check.

**Likely risks:**

- **No real staging environment in the workflows.** `deploy.yml`'s "validate" step does migrations against `STAGING_SUPABASE_DB_URL` if provided, but there is no separate Worker name / R2 bucket / KV namespace for staging in the visible config. The deploy goes directly from CI to the prod Worker.
- **`ALLOW_LOCALHOST_FALLBACK_IN_PROD: "1"`** is in `ci.yml`'s top-level env. Any new workflow that inherits these (or any developer that copy-pastes the block) gets a footgun.
- **The "security" workflow's devDependency audit is `continue-on-error`.** Acceptable but the warning is the only signal; a compromised dev dep that ships with secrets in CI will set off a warning that humans must read.
- **Migration runner** is a custom shell script. Migration policy lint catches naming, but there is no `psql` sandbox + replay test in CI proving every migration can apply _and_ its `-down` reverses cleanly on the same DB state. A single irreversible migration kills your rollback story.

**Missing evidence:**

- No SBOM artifact stored in releases (CycloneDX/SPDX). The doc claims SBOM exists but I did not see the publishing step in workflows.
- No artifact signing verification at deploy time — `attest-build-provenance` writes the attestation but I did not see a downstream `cosign verify-attestation` gate before deploy.
- No `npm-shrinkwrap.json` or `package-lock.json` integrity-check via subresource hashes outside `npm ci`.

---

### 3.6 Security

This is the section the repo invested the most in. The good news: most of the controls a security review will want to see exist. The bad news: the volume of controls is itself an audit-readiness liability, because few of them are end-to-end tested.

**Confirmed (strong):**

- Cookie security: `__Host-` prefix in secure context, `HttpOnly`, `Secure`, `SameSite=Strict`. Activity cookie HMAC-signed (anti-forgery).
- JWT: `jose`, asymmetric key fallback supported, `JWT_SECRET_CURRENT` / `JWT_SECRET_PREVIOUS` rotation with **24h hard enforcement at startup** (`checkRotationWindowExpiry`).
- Step-up auth for sensitive admin mutations (`lib/step-up-auth.ts`).
- HIBP k-anon password check + breach refusal on user creation.
- Internal HMAC with key derivation via purpose (`deriveHmacKey`) — not the raw JWT secret.
- SSRF guard: hostname normalization, IPv6-mapped IPv4 detection, CIDR blocklist for RFC1918 + CGNAT + cloud metadata (AWS/GCP/Azure/Alibaba), DNS lookup with timeout.
- Safe-redirect (`lib/safe-redirect.ts`) — same-origin allowlist with fuzz tests (`__tests__/security/safe-redirect-fuzz.test.ts`).
- HTML sanitization with `htmlparser2` + fuzz corpus (`sanitize-html-fuzz.test.ts`, `sanitize-html-bypass-corpus.test.ts`, `sanitize-html-entity-bypass.test.ts`).
- CSRF: timing-safe double-submit, anti-rate-limit (`csrf-rate-limit.test.ts`), origin validation as a second layer.
- Service-role isolation: single gateway (`lib/server-only/service-role.ts`), ESLint forbids importing the legacy `getServiceClient` from non-gateway paths, branded `PrivilegedSupabaseClient` type, first-use logging, 60s TTL on client memoization for rotation propagation.
- Per-purpose internal tokens (`INTERNAL_API_TOKEN_CLICK_QUEUE`, `_CRON`, `_INTERNAL`).
- gitleaks committed config; pre-commit hook via Husky.
- CodeQL + Semgrep custom rules.

**Confirmed (weaker than docs suggest):**

- Many "implemented" SOC2/ISO controls reduce to logging in Sentry (e.g. A.5.25/A.5.26 → "alerts" → Sentry → notification rails unverified).
- `assertRole(...)` returns 401 (Bearer challenge) for both authn and authz failures, by design — `G-45` rationale (route-existence side-channel removal). This is fine, but it makes admin RBAC testing harder; you cannot assert "403 because role insufficient" externally.
- `style-src 'unsafe-inline'` (documented above) — partial compensating control; not eliminated.
- Admin route obfuscation (`q7m-k4j9`) is a _defence-in-depth_ feature, not a control.

**Likely risks:**

- **Prompt injection on AI routes** is covered by `__tests__/live18-prompt-injection.test.ts`, `__tests__/ai/jailbreak-eval.test.ts`, `__tests__/ai/prompt-sanitization.test.ts`. These are unit tests against `lib/ai/prompt-sanitization.ts`. They are necessary but the _real_ attack on a multi-tenant content generator is hostile content stored in the DB later rendered into a prompt. Verify the prompt-builder reads from sanitized fields, not raw.
- **AI cost controls** exist (`lib/quotas.ts`, `lib/ai/circuit-breaker.ts`, `AI_GLOBAL_DAILY_CEILING_USD`). But the queue consumer runs at `max_concurrency: 2` for Supabase pool reasons — there is **no** corresponding global concurrency cap on outbound AI calls, only the daily $ ceiling. A bug that misattributes cost to the wrong tenant burns the global ceiling.
- **Webhook DLQ replay tooling** (`scripts/drain-dlq.ts`) — verify it requires elevated privilege and is audit-logged. A misuse of it could replay a stale Stripe event into a refunded state.
- **`ALLOW_TURNSTILE_DISABLED_IN_PROD`** is an env var the code respects. Acknowledged as an incident escape-hatch but unmitigated by anything other than discipline.
- **Cookie signing**: activity cookie is HMAC-timestamped, but the rate-limit grace window and the activity cookie maxAge derive from the same `IDLE_TIMEOUT_MS`. If `ADMIN_ACTIVITY_TIMEOUT_MINS` is mis-set, both behaviours drift together — a _good_ property when caught by tests, a _bad_ one if hot-config changes ever land.

**Missing evidence:**

- No DPIA / threat model in repo. `docs/penetration-test-plan.md` exists; results presumably out of repo.
- No `permissions-policy` per-endpoint differentiation (everything inherits the strict global; fine but worth knowing).

---

### 3.7 Architecture / Design

- **Monolith-on-edge.** All concerns (public, admin, API, cron, webhook, queue consumer) share one Worker, one Next.js bundle, one Supabase, one set of bindings. The only split is `affilite-mix-heavy-crons`.
- **Modularity within the Worker is good** — `lib/middleware/*` composable modules (`maintenance`, `cors`, `csrf`, `hostname`, `site-resolution`). Threaded `MiddlewareContext`. Easy to test.
- **Coupling**: high between routes and Supabase via DAL; mitigated by `lib/dal/*`. Stripe coupling localized in `lib/stripe-*`. AI coupling localized in `lib/ai/*`.
- **Service boundaries**: ill-defined. There is no internal RPC plane — everything calls in-process. Internal HMAC + per-purpose tokens exist for the _cron dispatcher hop_ (Worker scheduled → /api/cron/\*) and queue consumer hop. These are good but they exist precisely because there are HTTP hops where there shouldn't be.
- **Event-driven design**: Cloudflare Queues for clicks. Otherwise synchronous.
- **CQRS**: none. Reads and writes go through the same DAL with the same client.
- **Failure isolation**: weak — one Worker, one Postgres.
- **AI-readiness**: provider abstraction with feature flags and metadata (`lib/ai/providers.ts`, tests assert provider feature flags + model metadata). Good.
- **Builders/providers/auth abstraction**: good. `lib/affiliate/*`, `lib/ai/*`, single `getStripeClient`, single privileged-client gateway.

**Hard truth:** the abstraction quality is high enough that _splitting this into 2-3 Workers later is feasible_. Doing it now is the right call before scale forces it under incident pressure.

---

### 3.8 Performance / Scale / FinOps

- Bundle: `size-limit` with three buckets (shared/public/admin), ~1.2 MB envelope total. `(public)` budget is tight (~39 kB).
- Cold starts: `prewarmStripeWebhookKey` documented and used.
- Caching:
  - R2 incremental cache for ISR (`r2IncrementalCache`).
  - DO sharded tag cache wired (`doShardedTagCache`) — without this, `revalidateTag` was a silent no-op (documented `AUDIT-26`).
  - DO revalidation queue (`doQueue`) — de-dupes concurrent on-demand ISR.
  - KV cache for admin guard site-slug lookups (5-min TTL).
  - KV cache for HIBP prefix lists (24h TTL).
- Image optimizer: `minimumCacheTTL: 2_592_000`, `qualities: [75]`, exact remotePatterns — bounds amplification.
- Click queue: at-least-once, `max_batch_size: 25`, `max_batch_timeout: 5s`, `max_concurrency: 2`.
- Lighthouse CI workflow.
- Load test workflow (manual + nightly cron + post-deploy gate via `workflow_call`).

**At 10x traffic:**

- **Click queue consumer** at `max_concurrency: 2` becomes the bottleneck before Supabase does. Backlog grows; DLQ depth alert is the only signal.
- **Admin per-user rate limits** at 100 req/min admin global + 30/min mutate, fail-closed — under genuine load (bulk imports via `/api/admin/products/import`) you will trip these from your own UI.
- **HIBP prefix cache** has 24h TTL and stores ~16-40KB per entry; the cache cost is fine, but on cold start of a fresh isolate, every login pays the HIBP fetch.
- **Sentry sampling** `tracesSampleRate: 0.1` and `replaysOnErrorSampleRate: 0.1` — fine for cost; alerts on rare failures may not fire because the trace is sampled out.
- **No CDN purge automation** documented for stale ISR pages beyond `revalidateTag`. If a site definition changes domain, `wrangler.jsonc` custom domains and Cloudflare DNS are dashboard-managed; an emergency cutover is manual.

**At 100x traffic:**

- Supabase REST + Postgres becomes the single chokepoint. Connection pooling via the session pooler covers migrations but the JS client goes to the REST endpoint. PostgREST connection limits become the cap.
- KV writes for dedup (`click-dedup:...`) hit Cloudflare KV write rate limits. The repo already has telemetry for this (`trackKvDedupWrite` + `KV_DEDUP_WRITE_ALERT_RATE` env, default 500/min) — good signal but no documented action.
- Durable Object SQLite (rate-limiter, tag-cache, queue) is bounded by class instance throughput. The rate limiter uses one DO instance per key; high-cardinality keys spread load. The tag cache is sharded.

**Cost hotspots:**

- AI provider fan-out (multiple providers in `lib/ai/providers.ts`). `AI_GLOBAL_DAILY_CEILING_USD` is the only governor — if a runaway loop triggers many small generations it could exhaust the ceiling before the breaker trips.
- Image optimizer is bounded by `minimumCacheTTL` + exact hostnames — good. Amazon CDN paths remain until G-48 (R2 ingest) — flagged in code.
- KV reads on every rate limit and every site resolution — these are cheap but constant.

---

### 3.9 Observability / Operations

- Sentry (browser + Cloudflare).
- Workers observability enabled.
- Tail consumer to `affilite-mix-log-shipper`.
- Structured logger (`lib/logger.ts`) with PII redaction (`__tests__/logger-pii-redaction.test.ts`).
- Distributed tracing: `lib/tracing.ts`, `parseOrCreateTraceContext`, `exportTraceSpan`. ADR-0009 for real-time architecture.
- Custom metrics emitter (`lib/metrics.ts`, `middleware_latency_ms`, `kv_dedup_write_rate_exceeded`, `privileged_client_usage`).
- Alerts: Terraform Cloudflare notification policies (`worker_5xx_alert`, `worker_cpu_time_alert`, `click_tracking_dlq_depth`). **Mechanisms default to empty arrays — alerts may not actually page anyone.**
- Cron liveness: `lib/cron-liveness.ts` + `docs/cron-liveness.md`.
- Runbooks: `docs/alerting-runbook.md`, `docs/observability-runbook.md`, `docs/dlq-replay-runbook.md`, `docs/DR-RUNBOOK.md`, `docs/incident-response.md`.
- Post-mortems committed: `docs/post-mortems/2026-05-27-worker-crash-and-admin-login.md`.
- Backup/restore drill workflow (`backup-restore-drill.yml`).

**Likely gaps:**

- Error-budget / SLO targets exist in `docs/board-cyber-metrics.md` (referenced) but no SLO definition file in repo (e.g. `slo.yaml`). "Burn rate" alerts exist in name only without the SLI definition.
- Sentry alert rules are in `terraform/cloudflare/sentry-alerts.tf` — needs verification that the Sentry org+project IDs match prod.
- No chaos engineering in production — `__tests__/chaos/*` test suite exercises circuit breakers and KV outages in unit form, not in prod.

---

### 3.10 QA / Testing

- 212 test files across unit (`__tests__/`), integration (`__tests__/integration/`, `__tests__/e2e/`), Playwright e2e (`e2e/`), contract (`__tests__/contract/`), chaos (`__tests__/chaos/`), AI (`__tests__/ai/`), security (`__tests__/security/`).
- Stryker mutation testing.
- Vitest coverage threshold (G-37).
- Playwright + axe-core for a11y.
- Lighthouse CI.
- k6/load-test workflow.

**Strong coverage areas:**

- Auth/CSRF/CSP — extensive.
- Sanitize-HTML — fuzz + entity bypass corpus.
- Stripe webhook — fuzz + differential + idempotency regression + contract.
- Admin route authorization matrix.
- Migration order, env-var docs, runtime-env accessors.

**Likely gaps:**

- **Tests over the same in-memory mocks for Supabase do not validate RLS behaviour against a real Postgres.** `__tests__/rls-isolation.integration.test.ts` does (it's the integration suite, requires `TEST_WITH_SUPABASE=1`). Confirm CI runs the integration suite — it does not appear in `ci.yml`. The integration tests appear to be local-only.
- **No e2e for the full admin flow** (login → TOTP → create product → publish → see in public route). Playwright `public-flows.test.ts` exists; admin path coverage in Playwright unclear.
- **Mutation testing is in a separate workflow** — verify it gates anything. If it is informational, mutation score regressions land silently.

---

### 3.11 Business Logic / Product Integrity

- Affiliate domain allowlist (`AFFILIATE_DOMAIN_ENFORCEMENT=strict`), fail-open if KV miss for the allowlist itself.
- Click attribution via `lib/dal/affiliate-clicks.ts`, EPC recompute cron, click reconcile cron.
- Newsletter double-opt-in with signed tokens, unsubscribe abuse tests.
- Stripe membership tiers via metadata-driven price ID mapping (`resolveTierFromPriceId`).
- Refund handling: partial vs full distinction (`A169-01`).
- Right-to-delete: `2026050301_erase_subject_data_complete.sql`, `app/api/admin/privacy/*`, GDPR Art-21 objections table.
- Audit log: every admin mutation calls `recordAuditEvent` with `entity_type` + `entity_id`.
- Cookie consent integrates with analytics-category for Sentry; affiliate category likely gates click attribution.

**Risks:**

- **Stripe `checkout.session.completed` → `noop` on Supabase outage.** The processor `try { stripe.subscriptions.retrieve } catch { noop }`. The DLQ catches the webhook fail (good), but the _retrieval_ failure is silent. If Supabase is down but Stripe call succeeds, the membership will be created with empty period fields.
- **Tier resolution from price ID** depends on env vars `STRIPE_PRICE_ID_INSIDER`/`STRIPE_PRICE_ID_PRO`. A new price ID created without env update silently maps to default tier `"insider"` — revenue-affecting silent failure.
- **EPC recompute cron** runs daily at 06:00 UTC. If the cron misses (heavy-crons offload + secret rot), reports stay stale until next run. No "data freshness" alert observed.

---

### 3.12 AI / Data / Search

- Provider abstraction: `lib/ai/providers.ts` with feature flags and model metadata (tested).
- Sanitization: `lib/ai/prompt-sanitization.ts` (tested + jailbreak eval).
- Output validation: `lib/ai/output-validation.ts` (tested).
- Content moderation: `lib/ai/content-moderation.ts` (extended tests).
- Circuit breaker: `lib/ai/circuit-breaker.ts` (used also by Supabase and `authz.ts`).
- Cost controls: `AI_GLOBAL_DAILY_CEILING_USD`, per-tenant quotas (`__tests__/quotas/ai-quota-integration.test.ts`).
- Auto-publish gate: `__tests__/ai/oi-01-auto-publish-gate.test.ts` (compliance-style gate before AI content auto-publishes).
- Governance docs: `docs/ai-governance.md`, `docs/ai-risk-governance.md`, `docs/ai-system-technical-doc.md`, `docs/ai-red-team-plan.md`, `docs/ai-shadow-ab.md`, `docs/model-risk-assessment.md`.

**Risks:**

- The auto-publish gate is the only thing standing between an AI hallucination and a public page. The gate is tested but its rules need a periodic review baked into a calendar — not visible in repo.
- No vector DB / embeddings visible — if the system fans out into RAG, plan for retrieval injection now.

---

### 3.13 Web3 / Smart Contracts

No evidence found in repo.

---

### 3.14 Embedded / BT / OTA

No evidence found in repo.

---

## 4. Findings (deduplicated, ranked)

### Critical / High

**F-01 — Cloudflare alert mechanisms default to empty; on-call may not be paged.**

- Severity: **High** · Confidence: **High** · Domain: Operations
- Evidence: `terraform/cloudflare/alerts.tf` → `variable "alert_mechanisms"` defaults `{ email: [], pagerduty: [], webhooks: [] }`. Lifecycle precondition prevents apply with `enabled=true` and empty mechanisms — i.e. operators must wire destinations _out-of-band_. `alerts.auto.tfvars` exists but its content isn't validated by repo.
- Why it matters: SOC2 CC7.2 + ISO A.5.25/A.5.26 / A.8.16 all map to "alerts → human action". Untested alert paths look implemented in the doc but are operationally dormant.
- Production scenario: Worker 5xx burn rate exceeds SLO → policy fires → no destination receives it → silent incident.
- Remediation: gate Terraform apply on a presence-check of at least one mechanism _and_ schedule a quarterly synthetic alert test (`scripts/fire-test-alert.sh`).
- Priority: P0 · Effort: S.

**F-02 — Single Worker bundle for public + admin + webhook + queue + cron.**

- Severity: **High** · Confidence: **High** · Domain: Architecture / Reliability
- Evidence: `wrangler.jsonc` declares one `affilite-mix` Worker handling all routes; the only split is `wrangler.heavy-crons.jsonc`.
- Why it matters: any deploy that breaks the public path (CSS bug, hydration bug, Next.js minor) breaks Stripe webhook delivery, queue consumer, admin login, and every cron handler. Rollback is whole-bundle.
- Production scenario: a non-critical UI change ships → Worker raises an unhandled exception on cold start → Stripe webhook returns 5xx → Stripe disables endpoint after retries → subscriptions don't renew.
- Remediation: extract `/api/membership/webhook`, `/api/queue/clicks`, and cron routes into a second Worker that shares the same DAL (private npm package or vendored). Heavy-crons pattern proves the path.
- Priority: P1 · Effort: L.

**F-03 — No staging Worker / Supabase project visible.**

- Severity: **High** · Confidence: **Medium** · Domain: SDLC
- Evidence: `deploy.yml` validates migrations against `STAGING_SUPABASE_DB_URL` but the wrangler config has only one `name: "affilite-mix"`; no `[env.staging]` block.
- Why it matters: every prod deploy is a first-traffic deploy. Canary in `deploy-gradual.yml` is _traffic-split on prod_, not a separate environment.
- Remediation: add `[env.staging]` with a separate Worker name, KV/R2/DO bindings, and Supabase project; run smoke + load on staging before prod.
- Priority: P1 · Effort: M.

**F-04 — Stripe subscription retrieval failures silently degrade to `noop`.**

- Severity: **High** · Confidence: **High** · Domain: Business Logic
- Evidence: `lib/stripe-event-processor.ts` — for `checkout.session.completed`, `invoice.paid`, etc.: `try { sub = await stripe.subscriptions.retrieve(...); } catch { return { op: "noop" }; }`.
- Why it matters: a Stripe API outage at retrieval time turns the webhook into a successful 200 from our side but a no-op on our DB. The atomic-apply DLQ catches _our_ failures, not upstream retrieval failures. Memberships will be missing periods or never created; users paid but did not get access.
- Remediation: on retrieval failure, throw → return 5xx so Stripe retries → DLQ-write only after Stripe's own retry budget exhausts. Or write a partial-state row + a retry job.
- Priority: P0 · Effort: S.

**F-05 — `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1` is set globally in CI and only guarded by string substring at runtime.**

- Severity: **High** · Confidence: **High** · Domain: Security
- Evidence: `.github/workflows/ci.yml` line `ALLOW_LOCALHOST_FALLBACK_IN_PROD: "1"`; `instrumentation.ts` guards `appUrl.includes("localhost") || appUrl.includes("127.0.0.1") || appUrl === ""`.
- Why it matters: substring match is bypassable (`localhost-fake.example.com`). A misconfigured `APP_URL` could allow the flag through.
- Remediation: parse URL with `new URL(appUrl)` and compare `hostname === "localhost"` or matches `127.0.0.0/8`. Also reject this flag at IaC level when env is prod.
- Priority: P0 · Effort: S.

**F-06 — 253 migrations on one Postgres; clean-restore DR is brittle.**

- Severity: **High** · Confidence: **High** · Domain: Database / DR
- Evidence: `ls supabase/migrations | wc -l` → 253. ADR-0013 acknowledges the need to squash.
- Why it matters: any DB rebuild takes minutes per `CREATE INDEX CONCURRENTLY`; long replay window during DR. Extension/CREATE OR REPLACE drift between dev and prod becomes visible only at restore time.
- Remediation: execute ADR-0013. Squash everything ≤ 2026-04 into a single baseline; keep only the 60-day rolling window of incremental migrations. Add a clean-restore CI job.
- Priority: P1 · Effort: L.

**F-07 — `style-src 'unsafe-inline'` CSP gap.**

- Severity: **Medium** · Confidence: **High** · Domain: Security
- Evidence: `lib/csp.ts` accepted-risk comment + the directive itself.
- Why it matters: any reflected/persistent CSS injection becomes CSS exfiltration (`background-image: url(...)`). Compensating control is `lib/sanitize-html.ts` stripping style attributes — verify it runs on every user-authored field, including AI-generated body content rendered by TipTap (TipTap defaults can emit inline styles).
- Remediation: switch to nonced styles for components that need them; replace `vanilla-cookieconsent` v3 with the v3-nonced-style variant when available (REVISIT 2026-09-01 already in repo).
- Priority: P2 · Effort: M.

**F-08 — Admin segment uses path obfuscation (`/q7m-k4j9/`).**

- Severity: **Medium** · Confidence: **High** · Domain: Security / Architecture
- Evidence: `app/q7m-k4j9/`.
- Why it matters: not a control. Treat the admin segment as if `/admin/` and harden accordingly. Anti-pattern: any developer assuming the obfuscation provides protection.
- Remediation: move admin behind Cloudflare Access (zero-trust SSO) or IP allowlist via Cloudflare Rules. The legacy `/admin/*` 410 is already in place; the new path needs equivalent edge gating.
- Priority: P1 · Effort: M.

**F-09 — Bus factor / repo complexity.**

- Severity: **High** · Confidence: **High** · Domain: Architecture / SDLC
- Evidence: 148 docs, 253 migrations, 212 tests, 14 workflows, ~70 env vars, ADRs 0001–0013, two terraform stacks. Last 2 weeks: 1 commit on `main` (in shallow clone). This is either a steady-state burst or a single maintainer.
- Why it matters: onboarding cost is multi-week. A regression in any control's _meaning_ (e.g. fail-open semantics) is hard for a new engineer to spot.
- Remediation: write a "tour" doc (15 minutes to running locally + 5 critical files), enforce ADR-required PRs for any change to the trust/auth surface, and instrument the controls so behavior is observable, not only documented.
- Priority: P1 · Effort: M.

**F-10 — Sentry sampling at 10% may starve alerts on rare failures.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Observability
- Evidence: `sentry.client.config.ts` `tracesSampleRate: 0.1`.
- Remediation: keep traces at 10% but route exceptions at 100% (the SDK default for `captureException`). Verify the cloudflare-side config does the same. Configure release-health and crash-rate alerts.
- Priority: P2 · Effort: S.

**F-11 — `withAuthz` runs Supabase queries that ignore `AbortSignal`.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Reliability
- Evidence: middleware passes `signal` through `MiddlewareContext`, but `@supabase/supabase-js` does not honour `AbortSignal` for query methods (only the fetch adapter wrapped by `fetchWithTimeout`).
- Remediation: ensure every DAL call goes through `fetchWithTimeout` (it appears to in `lib/server-only/service-role.ts`). Add a metric for "post-timeout completion" to catch leaks.
- Priority: P2 · Effort: M.

**F-12 — `ALLOW_TURNSTILE_DISABLED_IN_PROD` env var exists.**

- Severity: **Medium** · Confidence: **High** · Domain: Security
- Evidence: env access in code.
- Why it matters: incident escape-hatch that a stressed operator may flip and forget to unflip.
- Remediation: log a high-severity Sentry event every request while the flag is on; auto-disable after N minutes via DO timer; require a comment-justification in the secret name.
- Priority: P2 · Effort: S.

**F-13 — Click queue consumer at `max_concurrency: 2` is the first scale bottleneck.**

- Severity: **Medium** · Confidence: **High** · Domain: Performance
- Evidence: `wrangler.jsonc` queue consumer block; rationale in comments cites Supabase connection pool exhaustion.
- Remediation: introduce a pgbouncer-backed connection pool / Supavisor and raise concurrency. Alarm on queue lag (Cloudflare Queues metric).
- Priority: P2 · Effort: M.

**F-14 — Migration policy lint doesn't replay forward+down on the same DB state.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Database / SDLC
- Evidence: `scripts/check-migrations.sh` (lint), `backup-restore-drill.yml`, `dr-drill.yml`. None visibly run `up → down → up` against a throwaway Postgres in CI.
- Remediation: add a CI job that spins up Postgres in docker compose and replays the full chain forward + every `-down` in reverse over an in-memory copy of seed data.
- Priority: P2 · Effort: M.

**F-15 — Tier resolution silently maps unknown Stripe price IDs to `"insider"`.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Business Logic
- Evidence: `lib/stripe-event-processor.ts` → `resolveTierFromPriceId` fallback behavior. Tier read from metadata first; price IDs as fallback.
- Remediation: if neither metadata nor known price ID resolves, write a flagged-incomplete row and emit a Sentry error + audit-log entry.
- Priority: P2 · Effort: S.

**F-16 — `affiliate-domain-allowlist` fail-open on KV miss.**

- Severity: **Medium** · Confidence: **High** · Domain: Business Integrity
- Evidence: `lib/affiliate-domain-allowlist.ts` has explicit `fail-open: best-effort [criticality:non-critical]`.
- Why it matters: an attacker who can store an affiliate URL in the DB (e.g. via a sufficiently broad admin role on a compromised tenant) and induce a KV miss for the allowlist gets click-through to an unsanctioned domain. The `AFFILIATE_DOMAIN_ENFORCEMENT=strict` env claims strict — this is partial.
- Remediation: in `strict` mode, fail-closed on KV miss (404 the redirect rather than allow). Add metric.
- Priority: P2 · Effort: S.

**F-17 — No SBOM artifact published in releases.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Supply chain
- Evidence: doc claims SBOM; no `cyclonedx`/`spdx` artifact upload in `.github/workflows/*`.
- Remediation: add `cyclonedx-npm` step + upload artifact + (optionally) attest with cosign.
- Priority: P2 · Effort: S.

**F-18 — `getInternalToken` legacy fallback to `INTERNAL_API_TOKEN`.**

- Severity: **Low / Medium** · Confidence: **High** · Domain: Security
- Evidence: `lib/internal-auth.ts` falls back to legacy token when per-purpose is unset.
- Why it matters: a leaked legacy token leaks the entire internal surface. The per-purpose split exists for blast-radius reduction; the fallback negates it.
- Remediation: refuse to start in prod when any per-purpose env is missing (mirror the cron-secret per-trigger gate).
- Priority: P2 · Effort: S.

**F-19 — `compareai.site` custom-domain managed only in Cloudflare Dashboard.**

- Severity: **Low** · Confidence: **High** · Domain: Infra drift
- Evidence: comment block in `wrangler.jsonc` explains the deliberate omission due to externally-managed DNS records.
- Remediation: track this in a separate IaC file that fails CI if the domain isn't either in wrangler or in a documented exclusion list. The current comment is documentation, not enforcement.
- Priority: P3 · Effort: S.

**F-20 — `style-src` accepted-risk has REVISIT 2026-09-01 — verify the date is tracked.**

- Severity: **Low** · Confidence: **High** · Domain: Hygiene
- Evidence: comment in `lib/csp.ts`.
- Remediation: file an issue and link it from the code comment; the comment itself is not a tracker.
- Priority: P3 · Effort: XS.

**F-21 — Admin RBAC returns 401 (not 403) for "wrong role".**

- Severity: **Low** · Confidence: **High** · Domain: Auditability / Compliance
- Evidence: `assertRole` returns 401 Bearer challenge.
- Why it matters: anti-enumeration (good) but logs do not differentiate "auth missing" from "role insufficient". Compliance reports that segregate failed-authn from failed-authz cannot be generated from access logs alone.
- Remediation: emit a typed audit-log entry distinguishing the two; keep the wire-level 401 unchanged.
- Priority: P3 · Effort: S.

**F-22 — `ESLint --max-warnings=0` only catches code in `lib/` and `app/`.**

- Severity: **Low** · Confidence: **Low** · Domain: SDLC
- Evidence: `npm run lint` invokes `eslint .` but `eslint.config.mjs` ignores `.open-next/**`, `.next/**`, `coverage/**`. Test mocks are checked but not workers/ in the same way.
- Remediation: add `npm run lint:worker` (already exists) to CI explicitly.
- Priority: P3 · Effort: XS.

**F-23 — `style-src 'unsafe-inline'` + TipTap content rendering risk.**

- Severity: **Medium** · Confidence: **Medium** · Domain: Security
- Evidence: TipTap dependency + accepted-risk note.
- Remediation: assert that all stored TipTap output passes `lib/sanitize-html.ts` _before_ rendering, with an explicit allowlist that strips `style`.
- Priority: P2 · Effort: M.

**F-24 — No documented secret rotation cadence for cron secrets.**

- Severity: **Low** · Confidence: **Medium** · Domain: Security / Compliance
- Evidence: ADR / runbooks exist; the rotation _cadence_ is not in repo (e.g. quarterly).
- Remediation: add `docs/secret-rotation-cadence.md` listing each secret + rotation interval + last rotated date.
- Priority: P3 · Effort: S.

**F-25 — Service-role usage logged "once per isolate" — alerting needs aggregation.**

- Severity: **Low** · Confidence: **High** · Domain: Security
- Evidence: `lib/server-only/service-role.ts` → `seenCallers` Set.
- Why it matters: an attacker who can reach the gateway from a _new_ caller path will log once and then be silent.
- Remediation: emit the metric `privileged_client_usage` to Cloudflare AE / log shipper with the caller dimension; alert on unknown callers.
- Priority: P3 · Effort: S.

---

## 5. Top 25 Risks Ranked by Real-World Impact

1. Cloudflare alerting destinations not wired (F-01)
2. Stripe retrieve silently `noop` on upstream failure (F-04)
3. Single-Worker blast radius (F-02)
4. No real staging environment (F-03)
5. `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1` global in CI + substring guard (F-05)
6. Admin path obfuscation mistaken for control + no edge gating (F-08)
7. 253 migrations / DR-restore brittleness (F-06)
8. CSP `style-src 'unsafe-inline'` (F-07)
9. Bus factor / complexity (F-09)
10. Affiliate allowlist fail-open in `strict` mode (F-16)
11. Tier resolution silently maps unknown price IDs (F-15)
12. Click queue at `max_concurrency: 2` (F-13)
13. Migration up/down not replayed in CI (F-14)
14. Supabase `AbortSignal` not honoured (F-11)
15. Legacy `INTERNAL_API_TOKEN` fallback negates blast-radius split (F-18)
16. TipTap inline-style escape path (F-23)
17. Sentry 10% sampling may starve rare-event alerts (F-10)
18. `ALLOW_TURNSTILE_DISABLED_IN_PROD` env exists (F-12)
19. SBOM not published in releases (F-17)
20. RBAC 401-collapses authn vs authz in logs (F-21)
21. `compareai.site` domain managed only in dashboard (F-19)
22. Service-role usage alerting depends on isolate diversity (F-25)
23. Secret rotation cadence not in repo (F-24)
24. CSP REVISIT date is a comment, not a tracker (F-20)
25. ESLint coverage gap on workers/ (F-22)

---

## 6. Fix First (P0/P1)

1. Wire `var.alert_mechanisms` and apply Terraform; fire a synthetic alert end-to-end. (F-01)
2. Make Stripe retrieve fail loud: return 5xx → Stripe retries → DLQ only after Stripe's retry budget. (F-04)
3. Remove `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1` from the top-level CI env; parse-URL guard at runtime. (F-05)
4. Add a staging `[env.staging]` in `wrangler.jsonc` with separate bindings + Supabase project; deploy → load → promote. (F-03)
5. Squash migrations to a baseline. (F-06)
6. Decompose Worker: extract webhook + queue + cron into a second Worker bundle sharing the DAL. (F-02)
7. Edge-gate the admin segment with Cloudflare Access. (F-08)

## 7. 24-Hour Quick Wins

- Fire a Sentry test event & a Cloudflare test notification — confirm both reach humans.
- Add a CI step that asserts every `app/api/admin/**/route.ts` imports `withAuthz` / `withAuthzDynamic` / `requireAdmin` / `requireSuperAdmin`.
- Add a runtime metric for "post-timeout Supabase completion" to make F-11 observable.
- Tag every place that does `try { … } catch { /* fail-open */ }` with a single `logger.warn` call so silent degradation becomes a counted event.
- Rotate every secret listed in `wrangler.jsonc` footer and write the date into `docs/secret-rotation-cadence.md`.

## 8. 30 / 60 / 90 Day Plan

**30 days**

- F-01, F-04, F-05 closed.
- Staging environment live (F-03).
- Migration squash plan executed for the baseline (F-06, phase 1).
- CSP unsafe-inline removal POC (F-07).
- SBOM + cosign verify-attestation gate (F-17).
- Per-purpose internal token fail-closed in prod (F-18).

**60 days**

- Worker decomposition: webhook + queue extracted (F-02).
- Admin segment behind Cloudflare Access (F-08).
- CI gate: up/down migration replay (F-14).
- DAL `AbortSignal` honoured everywhere (F-11).

**90 days**

- Multi-region read replica or Supavisor pool (F-13).
- ADR for failure isolation between cron worker and webhook worker.
- Full mutation-score gate ≥ 60% on `lib/auth.ts`, `lib/csrf.ts`, `lib/sanitize-html.ts`.
- Periodic AI auto-publish-gate review embedded in calendar.

---

## 9. What Breaks First at 10x Traffic

1. Click queue backlog (consumer concurrency 2).
2. Supabase REST connection cap → 5xx spikes on admin reads.
3. Cloudflare KV write rate on `click-dedup:*`.
4. Admin per-user rate-limit during bulk imports.
5. ISR revalidation backlog on the DO queue if many tags are invalidated at once.

## 10. What Fails a Security Review

- `ALLOW_TURNSTILE_DISABLED_IN_PROD` env present without time-bound auto-disable. (F-12)
- `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1` globally in CI. (F-05)
- CSP `style-src 'unsafe-inline'` (with documented accepted-risk, but still flagged). (F-07)
- Admin path obfuscation rather than edge gating. (F-08)
- Affiliate domain allowlist fail-open in `strict` mode. (F-16)
- Legacy internal-token fallback bypasses per-purpose split. (F-18)

## 11. What Fails a SOC 2 / ISO Review

- Alerting destinations not wired in IaC at apply time (F-01) → CC7.2 evidence gap.
- No staging environment (F-03) → CC8.1 change-management evidence weak.
- Secret rotation cadence not documented in repo (F-24) → CC6.1.
- Audit log doesn't distinguish failed-authn vs failed-authz (F-21) → CC6.1 / CC7.2 audit-readability gap.
- SBOM not published / verified at deploy (F-17) → CC9.1 / A.5.21.
- Migration up/down not exercised in CI (F-14) → A.8.32.

## 12. What Fails a Reliability Review

- Single Worker blast radius (F-02).
- Stripe retrieve `noop` (F-04).
- No active-active multi-region (F-03 implication).
- Click consumer concurrency cap (F-13).
- `AbortSignal` not honoured downstream (F-11).
- Alerting not proven (F-01).

## 13. What Fails a Scale Review

- Click queue + Supabase single-pool (F-13).
- 253-migration replay during a recovery (F-06).
- KV write rate for click dedup (telemetry exists, action plan does not).
- Worker SQLite DO instances bound by per-instance throughput; rate limiter sharding observed; tag-cache sharding observed; **revalidation queue is not sharded**.

---

## 14. Hard Truths

- This codebase is **rare** — the security and ops scaffolding is far above the median for a multi-tenant SaaS at this size. It is also **fragile** because most of the controls rely on a single operator's discipline (per-purpose secrets configured, alert destinations wired, env vars not flipped). The next person to touch this repo will either treat it with respect or quietly remove a fail-closed default.
- A lot of effort has gone into **documenting the absence of evidence** (per-route `fail-open: best-effort [criticality:non-critical]` markers). That is excellent for an auditor and dangerous for an operator — silent degradation is named but still silent. Promote each marker to a counted metric.
- The product is built on **two pieces of platform you do not own end-to-end**: Cloudflare and Supabase. The DR plan assumes Supabase recoverability. Stripe coupling is loose; Cloudflare coupling is tight (Workers + KV + DO + R2 + Queues + Turnstile + Access). Treat that as a strategic, not technical, risk.

---

## 15. If I Had To Rebuild This Cleanly

**Keep**:

- `lib/server-only/service-role.ts` gateway pattern + ESLint rule.
- `withAuthz` / `withAuthzDynamic` / `authorizeResource` primitives.
- Per-purpose internal tokens and per-trigger cron secrets.
- JWT key rotation with hard 24h enforcement.
- Stripe Web Crypto HMAC verification path.
- Click queue with idempotent consumer.
- Cron registry as the single source of truth.
- CSP per-request nonce with `'strict-dynamic'`.
- Test partitioning (unit / integration / chaos / contract / fuzz).
- Migration policy lint + ADR-required PRs.

**Redesign**:

- Split the Worker by trust tier (public read / admin write / webhooks / queue / cron) sharing a `@affilite-mix/dal` package.
- Promote staging to a first-class environment with its own bindings and Supabase project.
- Move admin behind Cloudflare Access. Drop the path obfuscation as a stated control.
- Replace `style-src 'unsafe-inline'` with nonced styles + a small set of static stylesheets.
- Squash migrations; adopt a 60-day rolling window only.

**Remove**:

- `ALLOW_LOCALHOST_FALLBACK_IN_PROD` from CI env.
- Legacy `INTERNAL_API_TOKEN` fallback in prod.
- The `ALLOW_TURNSTILE_DISABLED_IN_PROD` env as a free-form escape-hatch — replace with a time-bound DO flag.

**Standardize**:

- All "fail-open" code paths emit a `*_fail_open_total` counter that feeds an alert.
- All admin RBAC failures emit a typed audit-log entry distinct from authn failures.
- All providers (Stripe, Resend, AI providers, HIBP) go through a single `withCircuitBreaker(name, fetch)` wrapper with one alerting story.

---

## 16. Missing Artifacts You Should Provide Next

To finish what I cannot finish from the repo alone:

1. **Production architecture diagram** validated by an engineer (the one above is reconstructed from code, not from your head).
2. **Environment variable matrix** (`ENV_MATRIX.md`) listing every env var × dev/staging/prod × required/optional × secret-or-not × last rotated.
3. **Cloudflare config exports** for the live account: `wrangler whoami`, `wrangler secret list` per Worker, `wrangler kv:namespace list`, `wrangler r2 bucket list`, custom-domain attachments, WAF rules, Bot Fight Mode setting, Access apps, Turnstile site keys.
4. **Supabase project settings**: pooling mode, connection cap, RLS policies dump (`pg_dump --schema-only --no-owner --no-privileges`), extension list, backup retention, PITR window.
5. **Sentry org/project IDs + alert rules export** (so I can verify `terraform/cloudflare/sentry-alerts.tf` matches reality).
6. **GitHub Actions secrets list** (names only) — to verify CI/deploy env coverage.
7. **Stripe**: webhook endpoint configuration in the Stripe dashboard, event types subscribed, restricted-key scopes, current price IDs vs env values.
8. **Cloudflare R2 buckets**: public/private flags, lifecycle policies, CORS config.
9. **DNS records** for every custom domain (CAA, TXT for SPF/DKIM/DMARC if email, MTA-STS if applicable).
10. **Backup/restore evidence**: last successful DR-drill run output, PITR test report, Supabase backup config.
11. **Runbooks acceptance**: signed-off on-call rotation, paging policy, who gets `worker_5xx_alert`.
12. **DPA / sub-processor list** (`docs/vendor-dpas.md` is referenced — confirm signed copies exist).
13. **Threat model** (current state STRIDE-style by component).
14. **Cyber-insurance policy summary** (`docs/cyber-insurance.md` referenced — confirm in-force, retention, sub-limits).
15. **Penetration test report** — even an internal one (`docs/penetration-test-plan.md` references the plan, not the report).
16. **PII matrix at column level** (`docs/ropa.md`) — confirm it covers every table in migrations 00001..2026053001.
17. **AI auto-publish gate review log** — when was the rule set last reviewed by a human?
18. **Branch protection live state** export (the Terraform is in repo; verify drift).
19. **CI artifact retention policy** (build provenance, coverage, SBOM, audit logs).
20. **Cron secret rotation dates** for every `CRON_*_SECRET` and `INTERNAL_API_TOKEN_*`.

---

**End of audit.**

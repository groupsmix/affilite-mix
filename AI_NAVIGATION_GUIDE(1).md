# Project Architecture & Navigation Guide — `groupsmix/affilite-mix`

> Multi-tenant affiliate content platform. One codebase serves many domains; site is resolved per-request in `middleware.ts`.
> **Stack:** Next.js 15 (App Router, React 19) · Supabase (Postgres + RLS) · Tailwind v4 · Cloudflare Workers (`@opennextjs/cloudflare`) · TipTap · Cloudflare R2 · Turnstile · `jose` JWT · `bcryptjs` · `otpauth` TOTP · Sentry · Vitest · Playwright.

---

## 0️⃣ TL;DR — Request Lifecycle

1. `middleware.ts` runs on **every** request → resolves `hostname` → `site_id` (static `config/sites/*` first, then DB via `lib/dal/sites.ts`) → injects `x-site-id` + `x-trace-id` headers. Enforces CSRF double-submit on non-safe `/api/*` (with exempt list for auth/cron/beacon endpoints).
2. Request hits an **App Router** segment: `app/(public)/**` (tenant pages) or `app/admin/**` (admin UI) or `app/api/**` (route handlers).
3. Route handlers use `lib/api-handler.ts` + `lib/api-error.ts` wrappers and always go through `lib/dal/*` for DB access (tenant-scoped via `lib/dal/site-resolver.ts`).
4. Supabase server client in `lib/supabase-server.ts` (service role) / `lib/supabase.ts` (anon). Env validated in `lib/env.ts` + `lib/server-env.ts`.
5. Observability: `instrumentation.ts` → `lib/sentry.ts` → `lib/logger.ts` / `lib/report-error.ts`. Trace IDs via `lib/trace-id.ts`.
6. Deployed as a Cloudflare Worker (`workers/custom-worker.ts` + `wrangler.jsonc` + `open-next.config.ts`). Crons call `/api/cron/*` with `CRON_SECRET` (`lib/cron-auth.ts`).

---

## 1️⃣ Quick Directory Map

| Path | Purpose | Entry File(s) |
| :--- | :--- | :--- |
| `/middleware.ts` | Domain→site, CSRF, trace-id | `middleware.ts` |
| `/instrumentation.ts` | Next.js instrumentation (Sentry boot) | `instrumentation.ts` |
| `/sentry.client.config.ts` | Browser Sentry init | same |
| `/app` | Root layout, global error, sitemap, robots, manifest, icons | `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`, `app/web-vitals.tsx`, `app/r/[shortcode]/route.ts` (short-link redirect) |
| `/app/(public)` | Tenant-facing pages | `app/(public)/layout.tsx`, `app/(public)/page.tsx` |
| `/app/admin` | Admin CMS (login, reset, dashboard group) | `app/admin/login/page.tsx`, `app/admin/(dashboard)/layout.tsx`, `app/admin/(dashboard)/page.tsx` |
| `/app/api` | All HTTP handlers (admin, auth, cron, track, newsletter, quiz, community, membership, health, vitals, revalidate, internal) | `route.ts` files |
| `/components/admin` | Admin shell, sidebar, topbar, command menu, sticky-save forms | `admin-shell.tsx`, `admin-sidebar.tsx`, `admin-topbar.tsx`, `command-menu.tsx`, `tenant-badge-switcher.tsx`, `forms/*` |
| `/components/data-table` | TanStack-Table wrappers used in every admin list | `data-table.tsx`, `data-table-toolbar.tsx`, `use-data-table-url-state.ts` |
| `/components/ui` | shadcn/radix primitives | one file per primitive |
| `/lib` | Shared infra (auth, csrf, env, logger, sentry, r2, totp, sanitize-html, rate-limit, etc.) | see table §4 |
| `/lib/dal` | **All** Supabase access — tenant-scoped | `lib/dal/index.ts`, `lib/dal/site-resolver.ts` |
| `/lib/affiliate` | Affiliate link + network adapters (CJ, Admitad, PartnerStack) | `networks.ts`, `index.ts` |
| `/lib/ai` | AI provider fan-out (CF AI / Gemini / Groq / Cohere) | `providers.ts`, `content-generator.ts` |
| `/lib/analytics` | EPC + date-range helpers | `epc.ts`, `range.ts` |
| `/lib/ads` | Ad CPM defaults | `cpm-defaults.ts` |
| `/config` | Admin nav + site definitions | `admin-nav.ts`, `define-site.ts`, `site-definition.ts`, `sites/index.ts`, `sites/{ai-compared,arabic-tools,crypto-tools,watch-tools}.ts` |
| `/supabase/migrations` | Numbered SQL — schema source of truth (54 files, `00000`→`00052`) | see §6 |
| `/supabase/seed.sql` | Local/dev seed | same |
| `/workers/custom-worker.ts` | Custom CF Worker wrapping OpenNext output | same |
| `/types` | Shared TS types | `database.ts` (from Supabase), `cloudflare.d.ts`, `metadata.ts`, `supabase.ts` |
| `/scripts` | Ops scripts (tsx/sh) | `add-site.ts`, `pause-site.ts`, `redesign-site.ts`, `seed.ts`, `setup-supabase-auth.ts`, `audit-rich-results.ts`, `check-schema-drift.sh`, `check-bundle-size.sh`, `cf-security-snapshot.sh`, `generate-preview-wrangler.cjs`, `utils.ts` |
| `/__tests__` | Vitest unit + integration tests | mirrors lib/ and api/ paths |
| `/e2e` | Playwright e2e specs incl. a11y (axe-core) | `admin-login.spec.ts`, `admin-content.spec.ts`, `admin-products.spec.ts`, `admin-site-manager-delete.spec.ts`, `newsletter-signup.spec.ts`, `public-content.spec.ts`, `public-search.spec.ts`, `a11y.spec.ts`, `accessibility.spec.ts` |
| `/docs` | Runbooks + architecture | `architecture.md`, `multi-site-architecture.md`, `CLOUDFLARE.md`, `cloudflare-production.md`, `cloudflare-r2-images.md`, `rendering-cache-policy.md`, `public-rls-inventory.md`, `secrets-rotation-runbook.md`, `rollback-strategy.md`, `backup-strategy.md`, `incident-response.md`, `alerting-runbook.md`, `slo-definitions.md`, `dr-drill-checklist.md`, `promotion-states.md`, `supabase.md`, `ui-conventions.md`, `LAUNCH_READINESS.md`, `cloudflare-audit-remediation.md`, `cloudflare-recovery.md`, `ATTRIBUTIONS.md` |

---

## 2️⃣ Full API Route Index (`app/api/**/route.ts`)

### Auth (`/api/auth/*`) — JWT (`jose`) admin sessions; middleware-exempt where noted
| Path | Purpose | Server code |
| :--- | :--- | :--- |
| `/api/auth/csrf` | Issue CSRF cookie+token *(CSRF-exempt)* | `app/api/auth/csrf/route.ts` + `lib/csrf.ts` |
| `/api/auth/login` | Admin login (bcrypt, PBKDF2 legacy upgrade, optional TOTP) *(CSRF-exempt)* | `app/api/auth/login/route.ts` + `lib/auth.ts`, `lib/password.ts`, `lib/totp.ts` |
| `/api/auth/logout` | Revoke admin session | `app/api/auth/logout/route.ts` |
| `/api/auth/refresh` | Rotate JWT *(CSRF-exempt)* | `app/api/auth/refresh/route.ts` + `lib/jwt-rotation.ts` |
| `/api/auth/me` | Current admin identity | `app/api/auth/me/route.ts` + `lib/admin-guard.ts` |
| `/api/auth/forgot-password` | Email reset link | `app/api/auth/forgot-password/route.ts` |
| `/api/auth/reset-password` | Consume reset token | `app/api/auth/reset-password/route.ts` + `lib/password-policy.ts` |

### Admin CRUD (`/api/admin/*`) — `lib/admin-guard.ts` + `lib/audit-log.ts` on writes
| Path | Purpose | DAL |
| :--- | :--- | :--- |
| `/api/admin/sites` `/[id]` `/active` `/select` `/stats` `/templates` | Site CRUD + switcher + templates | `lib/dal/sites.ts`, `lib/dal/niche-templates.ts`, `lib/dal/admin-site-memberships.ts` |
| `/api/admin/users` `/me` `/me/password` `/me/totp` | Admin user CRUD + self-profile + 2FA setup | `lib/dal/admin-users.ts`, `lib/totp.ts`, `lib/password-policy.ts` |
| `/api/admin/content` `/clone` `/share` | Articles/posts CMS + versioning + cross-site share | `lib/dal/content.ts`, `lib/dal/shared-content.ts` |
| `/api/admin/content-products` | Link products to content | `lib/dal/content-products.ts` |
| `/api/admin/pages` `/[id]` `/reorder` | CMS static pages + reorder RPC | `lib/dal/pages.ts` |
| `/api/admin/products` `/export` `/import` | Product catalog CRUD + CSV in/out | `lib/dal/products.ts`, `lib/dal/product-affiliate-links.ts` |
| `/api/admin/categories` `/usage` | Taxonomy CRUD + referential usage check | `lib/dal/categories.ts` |
| `/api/admin/affiliate-networks` | Network config CRUD | `lib/dal/affiliate-networks.ts` |
| `/api/admin/ads` `/[id]` | Ad placements CRUD | `lib/dal/ad-placements.ts`, `lib/dal/ad-impressions.ts` |
| `/api/admin/analytics` | Aggregated dashboard metrics | `lib/dal/dashboard-stats.ts`, `lib/dal/revenue-per-site.ts`, `lib/analytics/epc.ts`, `lib/dal/niche-health.ts` |
| `/api/admin/ai-content` | Manual AI draft generation | `lib/ai/*`, `lib/dal/ai-drafts.ts` |
| `/api/admin/schedule` | Scheduled publish queue mgmt | `lib/dal/scheduled-jobs.ts` |
| `/api/admin/preview-token` | Short-lived unpublished-content token | `lib/preview-token.ts` |
| `/api/admin/upload` | Signed R2 upload | `lib/r2.ts`, `lib/image-placeholder.ts` |
| `/api/admin/feature-flags` | Per-site feature flags | `lib/dal/feature-flags.ts` |
| `/api/admin/integrations` | External network integrations (keys live in secrets, mapped to sites) | `lib/dal/integrations.ts` |
| `/api/admin/modules` | Enable/disable per-site modules | `lib/dal/modules.ts`, `lib/module-registry.ts` |
| `/api/admin/permissions` | Role/permission admin | `lib/dal/permissions.ts` |

### Cron (`/api/cron/*`) — externally triggered, `CRON_SECRET`, *CSRF-exempt*
| Path | Purpose |
| :--- | :--- |
| `/api/cron/publish` | Flip `scheduled` → `published`; archive expired |
| `/api/cron/ai-generate` | Generate AI drafts on schedule (`lib/ai/content-generator.ts`) |
| `/api/cron/price-scrape` | Update product prices → `lib/dal/price-snapshots.ts` → emits price alerts |
| `/api/cron/epc-recompute` | Rebuild EPC per product/network (`lib/analytics/epc.ts`) |
| `/api/cron/commission-ingest` | Pull commissions from CJ/Admitad/PartnerStack → `lib/dal/commissions.ts` |
| `/api/cron/expire-deals` | Archive expired deals/coupons → `lib/dal/deals.ts` |
| `/api/cron/sitemap-refresh` | Regenerate + ping search engines (`lib/sitemap-ping.ts`) |

### Public / beacon (`/api/track/*`, `/api/vitals`, `/api/newsletter/*`, `/api/products/*`, `/api/quiz/*`, `/api/community/*`, `/api/membership/*`, `/api/gift-finder`, `/api/health`, `/api/revalidate`, `/api/internal/*`)
| Path | Purpose | Notes |
| :--- | :--- | :--- |
| `/api/track/click` | Affiliate outbound click log *(CSRF-exempt, sendBeacon)* | `lib/tracking-url.ts`, `lib/dal/affiliate-clicks.ts` |
| `/api/track/impression` | Ad/product impression *(CSRF-exempt, sendBeacon)* | atomic via migration `00042` |
| `/api/vitals` | Web-vitals ingest *(CSRF-exempt, sendBeacon)* | table from `00023` |
| `/api/newsletter` | Double opt-in signup (Turnstile) | `lib/turnstile.ts`, migration `00004` |
| `/api/newsletter/confirm` | Confirm opt-in | |
| `/api/newsletter/unsubscribe` | Token-based unsubscribe *(CSRF-exempt — token is the auth factor)* | migration `00030` |
| `/api/products/[productId]/price-history` | Public price-history chart data | `lib/dal/price-snapshots.ts` |
| `/api/products/[productId]/price-alert` | Subscribe to price drops | `lib/dal/price-alerts.ts` |
| `/api/quiz/[slug]` `/submit` | Load + submit quiz funnel | `lib/dal/quizzes.ts`, migration `00047` |
| `/api/community/comments` `/wrist-shots` | UGC comments + user-submitted photos | `lib/dal/community.ts`, migration `00050` |
| `/api/membership/checkout` `/webhook` | Paid membership signup + provider webhook | `lib/dal/memberships.ts`, migration `00051` |
| `/api/gift-finder` | Server logic for gift finder UI | public tenant endpoint |
| `/api/health` | DB/service health | `lib/db-available.ts` |
| `/api/revalidate` | On-demand tag/path revalidation *(CSRF-exempt)* | `lib/cache-tags.ts` |
| `/api/internal/resolve-site` | Internal-only site resolver *(CSRF-exempt)* | `lib/internal-auth.ts` (`INTERNAL_API_TOKEN`) |
| `/app/r/[shortcode]/route.ts` | Affiliate short-link 301 redirector (non-`/api`) | `lib/tracking-url.ts` |

---

## 3️⃣ Public Pages (`app/(public)/**`) — tenant-scoped

| Route | Purpose |
| :--- | :--- |
| `/` | Home (`page.tsx`) |
| `/[contentType]` and `/[contentType]/[slug]` | Generic content-type listing & detail (reviews/guides/etc.) |
| `/content/[slug]` | Single article |
| `/p/[pageSlug]` and `/p/[comparison]` | CMS pages + comparison pages |
| `/category/[slug]`, `/brands[/slug]`, `/budget[/slug]`, `/occasion[/slug]`, `/recipient[/slug]` | Faceted taxonomy listings |
| `/deals` | Active deals |
| `/search` | Full-text search (`lib/dal/search-utils.ts`) |
| `/gift-finder` | Guided gift finder |
| `/media-kit`, `/contact`, `/privacy`, `/terms`, `/affiliate-disclosure` | Static tenant pages |
| `/newsletter/confirm`, `/newsletter/confirmed`, `/newsletter/unsubscribed` | Opt-in flow pages |
| `/feed.xml` | RSS feed (`route.ts`) |
| `not-found.tsx`, `error.tsx`, `loading.tsx` | Tenant-branded error/loading |

## Admin Pages (`app/admin/**`)

| Route | Purpose |
| :--- | :--- |
| `/admin/login`, `/admin/reset-password` | Public admin entry |
| `/admin/(dashboard)` | Home dashboard |
| `/admin/(dashboard)/sites` | Site manager |
| `/admin/(dashboard)/users` | Admin users |
| `/admin/(dashboard)/content[/new|/:id]` | Articles CMS (TipTap) |
| `/admin/(dashboard)/pages` | Static pages |
| `/admin/(dashboard)/products[/new|/:id]` | Product catalog |
| `/admin/(dashboard)/categories[/new|/:id]` | Taxonomy |
| `/admin/(dashboard)/affiliate-networks` | Network configs |
| `/admin/(dashboard)/ads` | Ad placements |
| `/admin/(dashboard)/ai-content` | AI draft workbench |
| `/admin/(dashboard)/analytics` | KPI dashboards |
| `/admin/(dashboard)/audit-log` | Audit trail |
| `/admin/(dashboard)/platform/{feature-flags,integrations,modules,permissions}` | Platform-level settings |
| `/admin/(dashboard)/settings` | Profile / 2FA / password |
| `/admin/(dashboard)/_dev-datatable` | Dev-only datatable playground |

---

## 4️⃣ `lib/*` Catalog (every file, 1-liner)

| File | Responsibility |
| :--- | :--- |
| `lib/auth.ts` | Admin session JWT verify/sign (uses `jose`) |
| `lib/admin-guard.ts` | Route-handler helper: require admin JWT + site membership |
| `lib/jwt-secret.ts` | Read/validate `JWT_SECRET` |
| `lib/jwt-rotation.ts` | Rolling rotation support for JWT signing keys |
| `lib/password.ts` | bcrypt hash/verify with transparent PBKDF2-legacy upgrade |
| `lib/password-policy.ts` | Password-strength rules |
| `lib/totp.ts` | TOTP enroll/verify (`otpauth` + QR) |
| `lib/csrf.ts` | Double-submit CSRF token helpers (cookie+header) |
| `lib/fetch-csrf.ts` | Client fetch wrapper that injects CSRF header |
| `lib/internal-auth.ts` | `INTERNAL_API_TOKEN` guard |
| `lib/cron-auth.ts` | `CRON_SECRET` header guard |
| `lib/rate-limit.ts` | In-memory/KV rate limiter |
| `lib/get-client-ip.ts` | IP extraction from CF headers |
| `lib/api-handler.ts` | Uniform request/response wrapper |
| `lib/api-error.ts` | Typed API errors + JSON shape |
| `lib/validation.ts` | Shared validators (zod-like) |
| `lib/validate-email.ts` | Email format + MX-light checks |
| `lib/sanitize-html.ts` | htmlparser2-based TipTap HTML sanitizer |
| `lib/env.ts` | Client-safe env surface |
| `lib/server-env.ts` | Server-only env (validated) |
| `lib/supabase.ts` | Anon Supabase client |
| `lib/supabase-server.ts` | Service-role Supabase client (server only) |
| `lib/db-available.ts` | Health probe for DB |
| `lib/site-context.ts` | Read `x-site-id` from request |
| `lib/active-site.ts` | Admin "currently viewing" site helper |
| `lib/cookie-utils.ts` | Cookie name/attr helpers (`IS_SECURE_COOKIE`) |
| `lib/trace-id.ts` | Generate/propagate `x-trace-id` |
| `lib/logger.ts` | Leveled logger (console + Sentry hooks) |
| `lib/sentry.ts` | Sentry init + tag helpers |
| `lib/report-error.ts` | Error → Sentry + structured log |
| `lib/audit-log.ts` | Admin action audit entries |
| `lib/cache-tags.ts` | Next tag builders for `revalidateTag` |
| `lib/wait-until.ts` | Cloudflare `waitUntil` wrapper |
| `lib/r2.ts` | Cloudflare R2 presigner/uploader |
| `lib/image-placeholder.ts` | Blur-hash / low-quality placeholder |
| `lib/sitemap-ping.ts` | Ping Google/Bing with sitemap URL |
| `lib/tracking-url.ts` | Build `r/<shortcode>` and parameterized affiliate URLs |
| `lib/preview-token.ts` | Short-lived signed tokens for unpublished preview |
| `lib/internal-links.ts` | Auto-internal-link rewriter |
| `lib/related-products.ts` | Related-product selection heuristics |
| `lib/auto-slug.ts` | Slugify utility |
| `lib/ab-testing.ts` | A/B assignment helpers (migration `00052`) |
| `lib/module-registry.ts` | Registry of opt-in platform modules |
| `lib/utils.ts` | `cn()` + misc helpers |
| `lib/turnstile.ts` | Cloudflare Turnstile verify |

### `lib/dal/*` — one module per table / aggregate (ALL Supabase access flows through here)
`index.ts` (barrel), `site-resolver.ts` (tenant scoping guard),
`sites.ts`, `admin-users.ts`, `admin-site-memberships.ts`, `permissions.ts`, `modules.ts`, `feature-flags.ts`, `integrations.ts`, `audit-log.ts`,
`content.ts`, `shared-content.ts`, `content-products.ts`, `pages.ts`, `categories.ts`, `products.ts`, `product-affiliate-links.ts`, `authors.ts`,
`affiliate-networks.ts`, `affiliate-clicks.ts`, `commissions.ts`,
`ad-placements.ts`, `ad-impressions.ts`,
`price-snapshots.ts`, `price-alerts.ts`, `deals.ts`,
`dashboard-stats.ts`, `revenue-per-site.ts`, `niche-health.ts`, `niche-templates.ts`,
`ai-drafts.ts`, `quizzes.ts`, `community.ts`, `memberships.ts`,
`scheduled-jobs.ts`, `search-utils.ts`, `type-guards.ts`.

### `lib/ai/*`, `lib/affiliate/*`, `lib/analytics/*`, `lib/ads/*`
- `lib/ai/providers.ts` — provider fan-out (enabled via `AI_ENABLE_{CLOUDFLARE,GEMINI,GROQ,COHERE}`)
- `lib/ai/content-generator.ts` — prompt → article pipeline
- `lib/affiliate/networks.ts` — CJ / Admitad / PartnerStack adapters
- `lib/analytics/epc.ts` — earnings-per-click calc
- `lib/analytics/range.ts` — date-range helpers (presets, tz)
- `lib/ads/cpm-defaults.ts` — default CPM fallbacks

---

## 5️⃣ Feature Traceability Table

| Feature / Problem | Primary Entry Point | Related Modules |
| :--- | :--- | :--- |
| Domain→site resolution | `middleware.ts` | `config/sites/index.ts`, `lib/dal/sites.ts`, `lib/site-context.ts`, `app/api/internal/resolve-site/route.ts` |
| Admin login + JWT | `app/api/auth/login/route.ts` | `lib/auth.ts`, `lib/jwt-secret.ts`, `lib/jwt-rotation.ts`, `lib/password.ts`, `lib/totp.ts`, `lib/admin-guard.ts` |
| Password reset | `app/api/auth/{forgot,reset}-password/route.ts` | `lib/password-policy.ts`, migration `00009_add_reset_token_columns.sql` |
| 2FA TOTP | `app/api/admin/users/me/totp/route.ts` | `lib/totp.ts`, migration `00045_admin_totp_2fa.sql` |
| CSRF | `middleware.ts` (exempt list) | `lib/csrf.ts`, `lib/fetch-csrf.ts`, `app/api/auth/csrf/route.ts` |
| Rate limiting | `lib/rate-limit.ts` | `lib/get-client-ip.ts`, `lib/api-handler.ts` |
| Content CMS | `app/admin/(dashboard)/content/*`, `app/api/admin/content/*` | `lib/dal/content.ts`, `lib/dal/shared-content.ts`, `lib/sanitize-html.ts`, migration `00012_content_versioning.sql` |
| Static pages | `app/admin/(dashboard)/pages/*`, `app/api/admin/pages/*` | `lib/dal/pages.ts`, migration `00026_reorder_pages_rpc.sql` |
| Products | `app/admin/(dashboard)/products/*`, `app/api/admin/products/*` | `lib/dal/products.ts`, `lib/dal/product-affiliate-links.ts`, migration `00043_authors_and_affiliate_links.sql` |
| Categories / taxonomy | `app/admin/(dashboard)/categories/*`, `app/api/admin/categories/*` | `lib/dal/categories.ts`, migrations `00007`, `00016`, `00021` |
| Affiliate click tracking | `app/api/track/click/route.ts`, `app/r/[shortcode]/route.ts` | `lib/tracking-url.ts`, `lib/dal/affiliate-clicks.ts`, `lib/affiliate/networks.ts` |
| Ad impressions | `app/api/track/impression/route.ts`, `app/admin/(dashboard)/ads` | `lib/dal/ad-impressions.ts`, `lib/dal/ad-placements.ts`, migrations `00015`, `00017`, `00042` |
| EPC / revenue | `app/api/admin/analytics/route.ts`, `app/admin/(dashboard)/analytics` | `lib/analytics/epc.ts`, `lib/dal/dashboard-stats.ts`, `lib/dal/revenue-per-site.ts`, `lib/dal/commissions.ts`, migrations `00027`, `00032`, `00048` |
| Newsletter | `app/api/newsletter/*`, `app/(public)/newsletter/*` | `lib/turnstile.ts`, migrations `00004`, `00030` |
| Search | `app/(public)/search/page.tsx` | `lib/dal/search-utils.ts` |
| Gift finder / Quiz | `app/api/gift-finder/route.ts`, `app/api/quiz/[slug]/*`, `app/(public)/gift-finder` | `lib/dal/quizzes.ts`, migration `00047` |
| Community UGC | `app/api/community/*` | `lib/dal/community.ts`, migration `00050` |
| Memberships | `app/api/membership/{checkout,webhook}/route.ts` | `lib/dal/memberships.ts`, migration `00051` |
| Scheduled publish | `app/api/cron/publish/route.ts` | `lib/cron-auth.ts`, `lib/dal/scheduled-jobs.ts`, migrations `00008`, `00025` |
| AI drafts | `app/api/cron/ai-generate/route.ts`, `app/api/admin/ai-content/route.ts` | `lib/ai/providers.ts`, `lib/ai/content-generator.ts`, `lib/dal/ai-drafts.ts`, migrations `00029`, `00037` |
| Price scrape + alerts | `app/api/cron/price-scrape/route.ts`, `app/api/products/[productId]/{price-history,price-alert}` | `lib/dal/price-snapshots.ts`, `lib/dal/price-alerts.ts`, migration `00046` |
| Commission ingest | `app/api/cron/commission-ingest/route.ts` | `lib/affiliate/networks.ts`, `lib/dal/commissions.ts`, migration `00048` |
| Deal expiry | `app/api/cron/expire-deals/route.ts` | `lib/dal/deals.ts`, migration `00049` |
| Sitemap / feed / robots | `app/sitemap.ts`, `app/robots.ts`, `app/(public)/feed.xml/route.ts`, `app/api/cron/sitemap-refresh/route.ts` | `lib/sitemap-ping.ts` |
| On-demand revalidate | `app/api/revalidate/route.ts` | `lib/cache-tags.ts`, `docs/rendering-cache-policy.md` |
| Image uploads (R2) | `app/api/admin/upload/route.ts` | `lib/r2.ts`, `lib/image-placeholder.ts`, `docs/cloudflare-r2-images.md` |
| Admin users + RBAC | `app/api/admin/{users,permissions}/*`, `app/admin/(dashboard)/users` | `lib/dal/admin-users.ts`, `lib/dal/admin-site-memberships.ts`, `lib/dal/permissions.ts`, `lib/admin-guard.ts`, migration `00036` |
| Feature flags / modules / integrations | `app/api/admin/{feature-flags,modules,integrations}/*` | `lib/dal/{feature-flags,modules,integrations}.ts`, `lib/module-registry.ts`, migration `00028` |
| Audit log | `app/admin/(dashboard)/audit-log/page.tsx` | `lib/audit-log.ts`, `lib/dal/audit-log.ts` |
| Health | `app/api/health/route.ts` | `lib/db-available.ts` |
| Web vitals | `app/api/vitals/route.ts`, `app/web-vitals.tsx` | migration `00023` |
| Sentry / tracing | `instrumentation.ts`, `sentry.client.config.ts` | `lib/sentry.ts`, `lib/report-error.ts`, `lib/trace-id.ts`, `lib/logger.ts` |
| A/B testing | `lib/ab-testing.ts` | migration `00052` |
| Monetization modules | `lib/module-registry.ts` | migration `00044` |
| Short-link redirector | `app/r/[shortcode]/route.ts` | `lib/tracking-url.ts` |

---

## 6️⃣ Migrations Map (`supabase/migrations/`) — schema **source of truth**

| Range | Theme |
| :--- | :--- |
| `00000` | Baseline repair |
| `00001` | Initial schema (core tables) |
| `00002` | Admin users |
| `00003`, `00020`, `00024`, `00031`, `00033`, `00034`, `00035`, `00038`, `00039`, `00040` | RLS hardening (defense-in-depth, drop legacy public policies, service-role policies, active-site check) |
| `00004`, `00030` | Newsletter double opt-in + unsubscribe tokens |
| `00005` | Image alt text |
| `00006`, `00022`, `00027`, `00032` | Analytics/niche-health/dashboard RPCs |
| `00007`, `00016`, `00021` | Taxonomy / category columns |
| `00008`, `00025` | Scheduled-publish status + indexes |
| `00009` | Password reset token columns |
| `00010` | Price columns |
| `00011`, `00013`, `00014` | Sites schema + `is_active` + seed |
| `00012` | Content versioning |
| `00015`, `00017`, `00042` | Ad placements + impressions + atomic RPC |
| `00018` | Shared content (cross-site) |
| `00019` | Niche templates |
| `00023` | Web vitals table |
| `00026` | Reorder-pages RPC |
| `00028` | Platform modules / permissions / integrations |
| `00029`, `00037` | AI drafts + model column; affiliate networks |
| `00036` | Admin site memberships |
| `00041` | Critical schema reconciliation |
| `00043` | Authors + affiliate links |
| `00044` | Monetization modules |
| `00045` | Admin TOTP 2FA |
| `00046` | Price snapshots + alerts |
| `00047` | Quiz funnel |
| `00048` | Commissions + EPC |
| `00049` | Deals |
| `00050` | Community UGC |
| `00051` | Memberships |
| `00052` | A/B testing + review state |

> **Rules:** never edit an existing migration; only add the next `000NN_*.sql`. Ignore `supabase/schema.sql` — it's a reference snapshot only. Regenerate `types/database.ts` after schema changes.

---

## 7️⃣ Critical Config & Env

**Env sources** — `.env.example` (Next runtime) and `.dev.vars.example` (Cloudflare Worker). Critical keys only, **no values ever in repo**:

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_POOLER_URL`, `STAGING_SUPABASE_DB_URL`
- **Auth/security:** `JWT_SECRET`, `INTERNAL_API_TOKEN`, `CRON_SECRET`, `CRON_HOST`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- **Email:** `RESEND_API_KEY`, `NEWSLETTER_FROM_EMAIL`
- **AI (toggles + keys):** `AI_ENABLE_{CLOUDFLARE,GEMINI,GROQ,COHERE}`, `CLOUDFLARE_AI_API_TOKEN`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`
- **Affiliate networks:** `CJ_API_KEY`, `CJ_PUBLISHER_ID`, `ADMITAD_API_KEY`, `ADMITAD_PUBLISHER_ID`, `PARTNERSTACK_API_KEY`
- **Cloudflare:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID`
- **R2 images:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- **Sentry:** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- **Multi-site:** `NEXT_PUBLIC_DEFAULT_SITE`, `WILDCARD_PARENT_DOMAINS`, `APP_URL`

**Build / runtime config files**
- `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `workers/custom-worker.ts`
- `middleware.ts`, `instrumentation.ts`, `sentry.client.config.ts`
- `tsconfig.json`, `tsconfig.worker.json`
- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `postcss.config.mjs`
- `vitest.config.ts`, `playwright.config.ts`, `lighthouserc.cjs`
- `components.json` (shadcn), `.husky/` + `lint-staged` (in `package.json`)
- `.github/` (CI)

**`package.json` — key libraries:** `next@15`, `react@19`, `@supabase/supabase-js`, `@opennextjs/cloudflare`, `jose`, `bcryptjs`, `otpauth`+`qrcode`, `@tiptap/*`, `@tanstack/react-table`, `radix-ui`, `tailwindcss@4`, `@sentry/cloudflare`+`@sentry/browser`, `htmlparser2`, `recharts`, `sonner`, `vaul`, `cmdk`, `vanilla-cookieconsent`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `husky`, `lint-staged`, `tsx`.

**`npm run` scripts:** `dev`, `build`, `start`, `lint`, `lint:worker`, `typecheck`, `typecheck:worker`, `typecheck:all`, `format`, `format:check`, `test`, `test:e2e`, `test:a11y`, `lighthouse`, `preview`, `deploy`, `upload`, `add-site`, `pause-site`, `redesign-site`, `seed`, `setup-supabase-auth`, `prepare` (husky).

---

## 8️⃣ AI Instructions for Future Sessions

- **Tenant context:** every request must have `x-site-id`. If you're writing a route/DAL call, propagate site scoping via `lib/site-context.ts` and `lib/dal/site-resolver.ts` — never query Supabase without it.
- **DB access:** do all reads/writes via `lib/dal/*`. If no DAL exists for what you need, **add a new file in `lib/dal/`** (keep tenant scoping). Never import `supabase-server` or `supabase` directly from a route handler.
- **Schema:** trust only `supabase/migrations/` (numbered) + `types/database.ts`. Do **not** edit `supabase/schema.sql`. For any column change, add the next migration file.
- **Routes:** every endpoint lives at `app/api/<area>/<name>/route.ts`. Wrap handlers via `lib/api-handler.ts` + `lib/api-error.ts`. Admin routes must call `lib/admin-guard.ts`. Cron routes must call `lib/cron-auth.ts`. Internal routes must call `lib/internal-auth.ts`.
- **CSRF:** state-changing requests need the double-submit token (`lib/fetch-csrf.ts` on client). If your endpoint is called via `sendBeacon`/webhook/cron, add it to the exempt set in `middleware.ts`.
- **Auth:** admin JWT via `lib/auth.ts`; rotating keys in `lib/jwt-rotation.ts`; TOTP in `lib/totp.ts`; password upgrade path in `lib/password.ts` (bcrypt + PBKDF2-legacy).
- **HTML:** any rich-text (TipTap) content must be piped through `lib/sanitize-html.ts` before persistence or render.
- **Caching:** use `lib/cache-tags.ts` tag builders and revalidate via `/api/revalidate`. See `docs/rendering-cache-policy.md`.
- **Images:** upload via `/api/admin/upload` → `lib/r2.ts`. Always pair with `lib/image-placeholder.ts` for LQIP.
- **AI:** `lib/ai/providers.ts` fans out to enabled providers (`AI_ENABLE_*`). Prompts/pipelines in `lib/ai/content-generator.ts`. Persist drafts via `lib/dal/ai-drafts.ts`.
- **Affiliate links & tracking:** build URLs via `lib/tracking-url.ts`; clicks ingested at `/api/track/click` (beacon, CSRF-exempt); ledger in `lib/dal/affiliate-clicks.ts`; commissions via `/api/cron/commission-ingest`.
- **Ads:** placements in `lib/dal/ad-placements.ts`; impressions atomic via migration `00042`; CPM defaults in `lib/ads/cpm-defaults.ts`.
- **Sites:** add new site with `npm run add-site` (`scripts/add-site.ts`). Never hand-edit `config/sites/*` without re-running. Pause with `npm run pause-site`.
- **Module toggles:** per-site features are registered in `lib/module-registry.ts` and persisted via `lib/dal/modules.ts` / `lib/dal/feature-flags.ts`.
- **Logs / errors:** throw typed errors from `lib/api-error.ts`; log with `lib/logger.ts`; surface to Sentry via `lib/report-error.ts`. Trace IDs are already on every request.
- **Observability:** `instrumentation.ts` boots Sentry; client via `sentry.client.config.ts`. Use `x-trace-id` when correlating logs.
- **Deployment:** Cloudflare Workers via OpenNext — `npm run preview` / `deploy` / `upload`. Custom worker lives in `workers/custom-worker.ts`; routes/crons/bindings in `wrangler.jsonc`. Runbooks in `docs/CLOUDFLARE.md`, `docs/cloudflare-production.md`, `docs/cloudflare-recovery.md`.
- **Tests:** unit/integration in `__tests__/` (`npm run test`, vitest); e2e in `e2e/` (`npm run test:e2e`, Playwright); a11y with `npm run test:a11y` (axe-core). Lighthouse budgets in `lighthouserc.cjs`.
- **Hooks:** `husky` + `lint-staged` auto-format/lint staged files on commit — don't bypass with `--no-verify`.
- **Never touch:** `supabase/schema.sql`, `.husky/` without reason, generated `types/database.ts` by hand, existing migrations. Never commit `.env`.
- **If analyzing "X", check first:**
  - auth/session issue → `middleware.ts` + `lib/auth.ts` + `lib/admin-guard.ts`
  - 403 Forbidden on a POST → CSRF exempt list in `middleware.ts`
  - tenant leakage suspicion → `lib/dal/site-resolver.ts` + the relevant `lib/dal/*`
  - slow/stale page → `lib/cache-tags.ts` + `app/api/revalidate/route.ts` + `docs/rendering-cache-policy.md`
  - failed cron → `lib/cron-auth.ts` + `wrangler.jsonc` triggers + Sentry trace ID
  - AI generation quirks → `AI_ENABLE_*` flags + `lib/ai/providers.ts`
  - payment/membership webhook → `app/api/membership/webhook/route.ts` + `lib/dal/memberships.ts`
  - new table needed → next `supabase/migrations/000NN_*.sql` + new `lib/dal/<name>.ts` + regen `types/database.ts`

---

## 9️⃣ CI / CD Workflows (`.github/workflows/`)

| Workflow | Purpose |
| :--- | :--- |
| `ci.yml` | Lint + typecheck + vitest on PR/push |
| `deploy.yml` | Production deploy to Cloudflare Workers (via OpenNext) |
| `preview.yml` | Per-PR preview deploy (see `scripts/generate-preview-wrangler.cjs`) |
| `rollback.yml` | Manual rollback workflow (runbook: `docs/rollback-strategy.md`) |
| `lighthouse.yml` | Lighthouse CI budgets (`lighthouserc.cjs`) |
| `security.yml` | Security scans (see `docs/cloudflare-audit-remediation.md`, `scripts/cf-security-snapshot.sh`) |
| `sbom.yml` | Generate Software Bill of Materials |
| `dependabot.yml` | Dependency update PRs (config only, not a workflow) |

---

## 🔟 Full Test Index

### Unit + integration — `__tests__/` (Vitest, `npm run test`)

**DB / multi-tenant / security (highest-value)**
- `middleware.test.ts` — CSRF + site resolution + trailing-slash rules
- `multi-site-routing.test.ts` — domain→site routing
- `get-site-by-domain.test.ts` — static lookup
- `dal-site-scoping.test.ts` — tenant-scoping enforcement in DAL
- `rls-isolation.test.ts` — Postgres RLS cross-tenant isolation
- `site-deactivation.test.ts` — deactivated-site behavior
- `csrf.test.ts`, `cookie-utils.test.ts`, `cookie-consent.test.ts`
- `sanitize-html.test.ts`, `upload-validation.test.ts`, `validation.test.ts`
- `env.test.ts`, `server-env.test.ts`, `supabase-server.test.ts`
- `get-client-ip.test.ts`

**Auth**
- `auth-config.test.ts`, `password.test.ts`, `password-policy.test.ts`
- `api/auth/auth.test.ts`, `api/auth/auth-integration.test.ts`, `api/auth/auth-timing.test.ts`
- `api/auth/forgot-password-route.test.ts`
- `admin-acl.test.ts`, `admin-users-query.test.ts`, `api/admin/users-last-super-admin.test.ts`

**Cron / audit / content**
- `cron-auth.test.ts`, `cron-publish.test.ts`
- `audit-log.test.ts`, `integration/audit-log-flow.test.ts`
- `content-filters.test.ts`, `internal-links.test.ts`
- `categories-dal.test.ts`, `categories-table.test.tsx`

**Newsletter + tracking**
- `api/newsletter-tracking.test.ts`, `api/newsletter-tracking-integration.test.ts`
- `api/newsletter-unsubscribe-abuse.test.ts`
- `integration/newsletter-flow.test.ts`
- `integration/impression-tracking.test.ts`
- `integration/password-reset-flow.test.ts`

**CRUD integrations**
- `api/crud.test.ts`, `api/crud-integration.test.ts`, `api/integration.test.ts`

**AI + analytics**
- `ai/providers-feature-flags.test.ts`, `ai/providers-model-metadata.test.ts`
- `analytics-epc.test.ts`

### End-to-end — `e2e/` (Playwright, `npm run test:e2e`)
- `admin-login.spec.ts` — admin auth flow
- `admin-content.spec.ts` — content CMS
- `admin-products.spec.ts` — product CRUD
- `admin-site-manager-delete.spec.ts` — destructive site ops
- `newsletter-signup.spec.ts` — public opt-in
- `public-content.spec.ts` — tenant reading
- `public-search.spec.ts` — search UI
- `a11y.spec.ts`, `accessibility.spec.ts` — axe-core (`npm run test:a11y`)

---

## 1️⃣1️⃣ Root Files & Misc

| File | Role |
| :--- | :--- |
| `README.md` | Project overview + setup |
| `CONTRIBUTING.md` | Contribution rules (branching, tests, commit style) |
| `CHANGELOG.md` | Release notes |
| `LICENSE`, `NOTICE.md`, `docs/ATTRIBUTIONS.md` | Licensing / third-party attributions |
| `public/favicon.svg` | Only static asset in `public/`; PWA/manifest assets generated via `app/icon.tsx` + `app/apple-icon.tsx` + `app/manifest.ts` |
| `.zed/` | Editor-specific config (safe to ignore) |
| `.prettierignore`, `.gitignore` | Tool ignore files |
| `components.json` | shadcn/ui generator config |
| `package-lock.json` | Lockfile |

> **Nothing else of substance exists outside this guide.** Everything in the repo that an AI would need to navigate is now indexed.

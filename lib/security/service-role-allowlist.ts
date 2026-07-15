/**
 * Allow-list of source paths that may import the privileged Supabase
 * gateway (`@/lib/server-only/service-role`).
 *
 * Service-role access bypasses RLS, so any file in this list must:
 *   - have a justifying comment at the import site explaining why a
 *     tenant-scoped client (`getTenantClient()`) cannot be used; and
 *   - be covered by a route-level auth gate (cron secret, internal
 *     bearer token, super_admin session, etc.) before the privileged
 *     client is reached.
 *
 * Adding a new entry must go through the security CODEOWNER review (see
 * `.github/CODEOWNERS`). The static test
 * `__tests__/service-role-allowlist.test.ts` fails CI if any source file
 * imports the gateway without being on this list.
 *
 * Test files are intentionally NOT covered here — vitest specs live under
 * `__tests__/` and are excluded from the allowlist scan because they only
 * run in CI/local dev and never ship to production.
 */
export const SERVICE_ROLE_IMPORT_ALLOWLIST = [
  // Gateway itself — re-exports getServiceClient under the approved name.
  "lib/server-only/service-role.ts",

  // Legacy thin wrapper kept until every direct caller is migrated.
  // This file is the only sanctioned place to import getServiceClient
  // from `@supabase/supabase-js` directly; new code must go through the
  // gateway above.
  "lib/supabase-server.ts",

  // Authorisation helpers run before any DAL call and therefore must
  // resolve admin context (active site, role membership) without a
  // tenant-scoped client.
  "lib/authz.ts",

  // Cloudflare Worker queue dispatcher cannot supply an x-site-id header
  // (no cookies, no admin session, the per-message site_id is in the
  // body). The route is INTERNAL_API_TOKEN-gated; see F-002 deep-audit
  // notes in app/api/queue/clicks/route.ts.
  "app/api/queue/clicks/route.ts",

  // Cron routes run from the Cloudflare scheduled handler and have no
  // request-scoped tenant context. Each route is gated by its
  // per-trigger Bearer secret via lib/cron-auth.ts.
  "app/api/cron/publish/route.ts",
  "app/api/cron/sitemap-refresh/route.ts",
  "app/api/cron/data-retention/route.ts",
  "app/api/cron/epc-recompute/route.ts",
  "app/api/cron/price-scrape/route.ts",
  "app/api/cron/ai-generate/route.ts",
  "app/api/cron/click-reconcile/route.ts",
  "app/api/cron/commission-ingest/route.ts",
  "app/api/cron/expire-deals/route.ts",
  "app/api/cron/stripe-sync/route.ts",
  "app/api/cron/access-review/route.ts",
  "app/api/cron/homepage-synthetic-check/route.ts",

  // Admin guard runs before any tenant context is established and
  // needs to look up admin sessions / memberships across sites. The
  // function is invoked from inside `requireAdmin`, which is itself
  // the gate for cookie-authenticated admin routes.
  "lib/admin-guard.ts",

  // Click ingestion queue worker writes to `affiliate_clicks` from
  // the Cloudflare Queue handler. Queue messages have no cookies and
  // carry their own per-message `site_id`; the queue endpoint
  // (`app/api/queue/clicks/route.ts`) is gated by INTERNAL_API_TOKEN.
  "lib/click-queue.ts",

  // Auth login route needs service_role to read admin_users (password_hash,
  // lockout state) — RLS correctly blocks authenticated role from this table.
  // The route is public but rate-limited (3 attempts / 15min per IP, 100/min
  // global). Service-role access is confined to user lookup + lockout updates.
  "app/api/auth/login/route.ts",

  // authenticateUser() needs service_role to look up admin_users.password_hash
  // for bcrypt verification. Called only from the login route above.
  "lib/auth.ts",

  // Default DAL client getter — provides the privileged client only
  // when callers explicitly opt in by passing it (or rely on the
  // default in cron / internal contexts already on this allow-list).
  // Tenant-scoped routes always pass `getTenantClient` instead.
  "lib/dal/dal-client.ts",

  // Admin site-resolver: resolving (and lazily provisioning) the active
  // site is a control-plane read/write against the global `sites` registry,
  // which RLS restricts to service_role for writes. Mirrors requireAdmin()'s
  // privileged slug→UUID lookup in lib/admin-guard.ts. Reached only from
  // authenticated admin Server Components that have already passed
  // getAdminSession() — see lib/dal/site-resolver.ts for the full rationale.
  "lib/dal/site-resolver.ts",

  // Admin cross-site site registry reads. listAdminSites in lib/dal/sites.ts and
  // the Niche Health / Estimated Revenue DALs in lib/dal/niche-health.ts and
  // lib/dal/revenue-per-site.ts query the global `sites` table and aggregate
  // per-site clicks/content across tenants. The authenticated role has no SELECT
  // policy on `sites`, and per-site tables (affiliate_clicks, products, content)
  // are RLS-scoped to the active site, so the tenant client returned zero rows
  // and the dashboard cards were blank. These DALs are reached only from the
  // super_admin-gated dashboard (page.tsx renders them only when isSuperAdmin).
  "lib/dal/sites.ts",
  "lib/dal/niche-health.ts",
  "lib/dal/revenue-per-site.ts",

  // B-F3: Multi-Niche Overview page aggregates per-site clicks, products and
  // content across every tenant. The tenant client is restricted to the active
  // site, so the rollup was blank. The helper is only reached from the
  // super_admin-gated analytics page.
  "lib/dal/analytics-dashboard.ts",

  // Admin user reads/writes (Settings + Users tabs and /api/admin/users) target
  // the global `admin_users` table, whose RLS grants access to service_role only
  // (migrations 00002 / 00040 "admin_users_service_all"). The tenant client
  // returns zero rows / is denied on this table, so every admin-users DAL helper
  // defaults to the privileged client. Reached only from requireAdminSession() /
  // requireAdmin()-gated callers (and the rate-limited, signature-checked login
  // path, which also passes the privileged client explicitly via lib/auth.ts).
  "lib/dal/admin-users.ts",

  // Admin API token reads/writes are cross-tenant (tokens are generated by a
  // super_admin and can be exchanged for a session without an active site).
  // The table is RLS-enabled and only service_role can access it (migration
  // 2026071101). Reached from requireAdminSession()-gated /api/admin/api-tokens
  // routes and the /api/auth/token-login rate-limited exchange route.
  "lib/dal/admin-api-tokens.ts",

  // AUTHZ-FIX: hasPermission() reads admin_users, user_site_roles, roles and
  // permissions/role_permissions to decide feature-level access. These tables are
  // service_role-only (migrations 00002 / 00033 / 00036 / 00040), so the tenant client
  // returns zero rows and all /api/admin/* routes behind withAuthz() return 503.
  // The privileged client is reached only through requireAdmin() / requireAdminSession()
  // gated paths, and every site-scoped call retains an explicit .eq('site_id', ...) /
  // tenant opt-out guard.
  "lib/dal/permissions.ts",

  // price_alerts has a service_role-only RLS policy by schema design
  // (migrations 00046/00055/00078; the public anon-insert path was removed
  // in 00034). No authenticated/anon policy exists, so a tenant-scoped client
  // is always denied on this table. Every price-alerts DAL helper therefore
  // defaults to the privileged client. Public callers (the rate-limited +
  // Turnstile-gated price-alert subscription route) reach it only after
  // explicit app-layer site scoping (site_id predicates + productBelongsToSite),
  // so cross-tenant access is prevented without relying on RLS.
  "lib/dal/price-alerts.ts",

  // LIVE-10 / F-024: applyStripeEventAtomic calls the
  // apply_stripe_membership_event RPC, which is GRANTed only to
  // service_role. The Stripe webhook delivers events with no
  // x-site-id header and no admin session, so a tenant-scoped client
  // can't resolve. The webhook route is gated by Stripe-signature
  // verification (lib/stripe-webhook.ts) before this DAL is reached.
  "lib/dal/stripe-events.ts",

  // F-21: Webhook dead-letter queue persists failed Stripe events for
  // replay tooling. Uses service-role because webhook context has no
  // tenant-scoped session. Gated by Stripe-signature verification in
  // the parent webhook route (app/api/membership/webhook/route.ts).
  "lib/dal/webhook-dlq.ts",

  // Admin sites routes need service-role to query admin_site_memberships
  // (RLS blocks anon/authenticated from this table). These routes are
  // gated by requireAdmin / requireAdminSession before the privileged
  // client is reached. They operate across site boundaries (listing all
  // sites, selecting a site) before tenant context is established.
  "app/api/admin/sites/route.ts",
  "app/api/admin/sites/select/route.ts",

  // F5 audit: hard-delete path for a tenant registry row. The DELETE handler
  // is super_admin + step-up gated at the route layer (assertRole +
  // requireStepUpAuth) and calls deleteSite() which throws unless
  // callerRole === "super_admin" (lib/dal/sites.ts:361). Hard-deleting a
  // tenant requires the privileged client — the tenant client cannot reach
  // the global `sites` table. Safe by construction.
  "app/api/admin/sites/[id]/route.ts",

  // Site stats endpoint lists ALL sites via listSites() to batch-fetch  // per-site counts (products, content, clicks). Like the sites list
  // route above, getTenantClient() mints HS256 JWTs that fail against
  // asymmetric Supabase signing keys, so the privileged client is
  // required. The route is gated by requireAdminSession() and operates
  // before any tenant context is established (stats must be visible
  // before a site is set as active).
  "app/api/admin/sites/stats/route.ts",

  // B-F2: Performance-by-domain and multi-niche rollups iterate every site in
  // the registry via listSites() / listAdminSites() + getClickCount() / countProducts
  // / countContent(). The default RLS tenant client only sees the active site,
  // so all other tenants returned 0 clicks/$0 and 0 products/content. The routes
  // are super_admin-gated and are inherently cross-tenant aggregations —
  // privileged client is required by design.
  "app/api/admin/analytics/domains/route.ts",

  // Health liveness probe uses service-role for the DB connectivity check.
  // getTenantClient() mints HS256 JWTs which break when Supabase is
  // configured with asymmetric-only signing keys. The health endpoint is
  // rate-limited (10 req/min/IP) and returns no sensitive data.
  "app/api/health/route.ts",

  // M2: listAllAdminSiteMembershipsWithSlugs() reads admin_site_memberships
  // across ALL sites to render the super_admin Users page "Sites access"
  // column. RLS grants this table to service_role only (migrations 00036 /
  // 00040 / 00067), so the tenant client returns zero rows. Reached only from
  // the requireAdminSession()-gated Users page. Mirrors lib/dal/admin-users.ts.
  // (M3 audit-log actor resolution deliberately does NOT import the gateway —
  // it delegates to lib/dal/admin-users.ts, which already owns admin_users.)
  "lib/dal/admin-site-memberships.ts",

  // Audit Log export is a super_admin-only route. `audit_log` SELECT is
  // service_role-only (migrations 00033 / 00040), so the privileged client is
  // required. The route uses `requireSuperAdmin()` and passes the resolved
  // active `site_id` to site-scoped DAL helpers.
  "app/api/admin/audit-log/export/route.ts",

  // Platform admin tabs (Modules, Integrations, Permissions) read/write config
  // tables whose RLS was locked down in migrations 00033 / 00040 / 2026052801:
  // site_modules, site_integrations and user_site_roles are service_role-only;
  // roles / permissions / integration_providers allow authenticated read but the
  // routes also touch a service_role-only table in the same handler. The default
  // tenant client (authenticated role) therefore returns zero rows / is denied,
  // leaving these pages blank. Each route is gated by withAuthz(super_admin) (or
  // requireAdmin + assertRole('super_admin') for permissions) and every
  // site-scoped DAL call carries an explicit `.eq('site_id', …)` predicate, so
  // tenant isolation is preserved without relying on RLS.
  "app/api/admin/modules/route.ts",
  "app/api/admin/integrations/route.ts",
  "app/api/admin/permissions/route.ts",

  // Audit Log is a super_admin-only Server Component. `audit_log` SELECT is
  // service_role-only (migrations 00033 / 00040 — only an authenticated INSERT
  // policy exists), so the tenant client read zero rows and the grid was always
  // empty. Reads are pinned to the caller's active site via `.eq('site_id', …)`.
  "app/q7m-k4j9/(dashboard)/audit-log/page.tsx",

  // Audit *writer*: recordAuditEvent persists to `audit_log`, whose INSERT is
  // granted to service_role only (migration 2026050103 `audit_log_service_insert`;
  // UPDATE/DELETE are revoked from every role). The tenant/authenticated client is
  // RLS-denied — and degrades to anon on a SUPABASE_JWT_SECRET mismatch — so every
  // event was silently dropped and the Audit Log grid was always empty. The ledger
  // spans all sites plus global/auth events (site_id = NULL), so writes use the
  // cross-tenant `.unsafeNoSiteFilter()` opt-out. Reached only from server-side
  // admin/auth handlers (super_admin-gated routes and the rate-limited login path)
  // that have already gated the caller. Mirrors the audit reader entry above.
  "lib/audit-log.ts",

  // Automation control plane: the automation_* tables (service accounts,
  // tokens, runs, actions, policies — migration 2026071505) are
  // service_role-only, and the automation API gateway has no browser cookie,
  // no x-site-id header and no admin session (it authenticates a bearer
  // token, then operates on behalf of a single site). This module is the
  // ONLY automation file that touches the privileged gateway; every
  // automation DAL + route reaches the privileged client through it, after
  // the route layer has authenticated + scope-checked the token. Site
  // scoping is enforced in app code via the token's bound site_id (never
  // request input). Mirrors lib/dal/admin-api-tokens.ts.
  "lib/automation/db.ts",
] as const;

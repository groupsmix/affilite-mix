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

  // Admin user reads/writes (Settings + Users tabs and /api/admin/users) target
  // the global `admin_users` table, whose RLS grants access to service_role only
  // (migrations 00002 / 00040 "admin_users_service_all"). The tenant client
  // returns zero rows / is denied on this table, so every admin-users DAL helper
  // defaults to the privileged client. Reached only from requireAdminSession() /
  // requireAdmin()-gated callers (and the rate-limited, signature-checked login
  // path, which also passes the privileged client explicitly via lib/auth.ts).
  "lib/dal/admin-users.ts",

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

  // Site stats endpoint lists ALL sites via listSites() to batch-fetch
  // per-site counts (products, content, clicks). Like the sites list
  // route above, getTenantClient() mints HS256 JWTs that fail against
  // asymmetric Supabase signing keys, so the privileged client is
  // required. The route is gated by requireAdminSession() and operates
  // before any tenant context is established (stats must be visible
  // before a site is set as active).
  "app/api/admin/sites/stats/route.ts",

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
] as const;

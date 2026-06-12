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
] as const;

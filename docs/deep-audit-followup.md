# Deep Audit Follow-up — F-001 / F-009 / F-011 / F-013

This document tracks the multi-PR follow-up for findings whose remediation is
larger than a single audit-fix PR. The PR that introduced this document
(re: deep audit F-001..F-016) addressed the route-level bleeding edges —
`/api/queue/clicks` and the cron routes that called `getTenantClient()`
directly — and left the broader DAL/permissions refactor for staged work
captured here.

## F-001 — finish the DAL/RLS alignment

**Status (as of this PR):** route-level fix landed for cron handlers that
called `getTenantClient()` directly (`publish`, `sitemap-refresh`,
`data-retention`, `epc-recompute`, `price-scrape`) and for
`/api/queue/clicks`. Those code paths now use
`getPrivilegedSupabaseClient()` from `lib/server-only/service-role` and
perform their own tenant scoping per query.

**What still uses `getTenantClient()` from a backend context (cron, queue,
webhook) and therefore mints a JWT with no `site_id` claim, failing the
`tenant_isolation_auth_<table>` predicate in migration 00067:**

| DAL                           | Used by                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `lib/dal/commissions.ts`      | `app/api/cron/commission-ingest/route.ts`                   |
| `lib/dal/deals.ts`            | `app/api/cron/expire-deals/route.ts`                        |
| `lib/dal/stripe-events.ts`    | `app/api/cron/stripe-sync/route.ts`, Stripe webhook handler |
| `lib/dal/ai-drafts.ts`        | `app/api/cron/ai-generate/route.ts`                         |
| `lib/dal/memberships.ts`      | Stripe webhook (checkout.session.completed)                 |
| `lib/dal/affiliate-clicks.ts` | `recordClick()` (called from `/api/track/click`)            |
| `lib/dal/price-snapshots.ts`  | scrape worker, anomaly detector                             |

**Recommended remediation pattern:**

1. Each DAL function gains an optional `client?: SupabaseClient<Database>`
   parameter:

   ```ts
   export async function createAIDraft(
     row: AIDraftInsert,
     client?: SupabaseClient<Database>,
   ) {
     const sb = client ?? (await getTenantClient());
     ...
   }
   ```

2. Cron / queue / webhook handlers pass the privileged client explicitly:

   ```ts
   const sb = getPrivilegedSupabaseClient();
   await createAIDraft(row, sb);
   ```

3. Tenant-facing call sites (admin browser sessions with a valid
   `x-site-id` header) keep the no-arg form and continue to mint a tenant
   JWT.

This keeps the privileged-client surface area small and explicit while
unblocking every backend write path. **Do NOT make `getTenantClient()`
silently fall back to the privileged client when the tenant header is
missing** — that would silently escalate misconfigured tenant requests
and lose the RLS guarantee.

## F-009 — apply granular permission checks to all admin routes

`lib/authz.ts` exposes `withAuthz` and `authorizeResource`, but the
inspected routes (`/api/admin/products`, `/api/admin/content`,
`/api/admin/ai-content`, `/api/admin/users`) gate on
`requireAdmin()` / role checks rather than feature/action permissions.

**Plan:**

1. Define the canonical permission catalogue in
   `lib/permissions/catalog.ts` — feature × action pairs (`products:write`,
   `content:publish`, `ai-content:approve`, `users:read`, etc.).
2. Migrate one route family at a time to `withAuthz` with the matching
   permission key. Start with the highest-blast-radius routes
   (`/api/admin/users`, `/api/admin/sites`).
3. Add a CI lint that scans `app/api/admin/**/route.ts` for
   `requireAdmin()` calls without an accompanying `withAuthz`.

## F-011 — make the DB site registry authoritative for the admin guard

`lib/admin-guard.ts:requireAdmin` calls `getSiteById(siteSlug)` against the
static `config/sites/*` registry. Sites created at runtime via
`/api/admin/sites` have no static config entry, so the guard rejects them.

**Plan:**

1. Replace the static `getSiteById` lookup with a registry that prefers
   `lib/dal/sites.ts:getSiteBySlug(slug)` (DB-backed) and falls back to
   the static config only for seed/known sites.
2. Cache the lookup against `APP_CACHE_KV` to avoid hammering the DB on
   every admin request.
3. Add an integration test that creates a DB site, sets the cookie to its
   slug, and asserts `requireAdmin()` resolves to the DB site's `id`.

## F-013 — provider→site mapping for commission ingest

`/api/cron/commission-ingest` writes `site_id` directly from
provider-supplied identifiers (CJ `shopperId`, Admitad `subid`,
PartnerStack `customer_key`). Those fields are not guaranteed to be the
DB UUID for the corresponding site.

**Plan:**

1. New migration: `affiliate_tracking_keys(site_id uuid, network text,
tracking_key text, primary key (network, tracking_key))`.
2. `lib/dal/affiliate-tracking-keys.ts` with `resolveSiteByTrackingKey`.
3. Commission ingest replaces direct `site_id` mapping with
   `resolveSiteByTrackingKey(network, providerKey)` and discards (with an
   `audit_events` row) any commission whose tracking key has no
   registered owner.
4. Admin UI to manage tracking keys per site / network.

## F-006 — replace "snapshot" with a real backup

`migrate-production` writes a table inventory and ledger to `/tmp` and
calls it a snapshot. It is not a backup.

**Plan:**

1. Add a `pg_dump --schema-only` plus `pg_dump --data-only --table=…`
   step that writes to `r2://affilite-mix-backups/<commit-sha>.sql.zst`
   immediately before the migration apply.
2. Verify the dump by streaming it back through `pg_restore --list`.
3. Document the restore procedure in `docs/DR-RUNBOOK.md`.

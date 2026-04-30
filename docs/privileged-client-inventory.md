# Privileged Supabase Client Inventory (FIX-04 / F-001, F-011)

Every call site of `getPrivilegedSupabaseClient` (service-role, bypasses RLS)
is listed below with its justification and tenant-scoping mechanism.

## Production call sites

| File                                      | Justification                                                             | Tenant-scoping                                            |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `lib/supabase-server.ts`                  | Legacy gateway — resolves active-site slug → UUID for `getTenantClient()` | `.eq("slug", activeSlug)` in `getSiteRowBySlugWithClient` |
| `lib/admin-guard.ts`                      | Resolves site slug → DB UUID for admin session binding                    | `.eq("slug", siteSlug)` in `getSiteRowBySlugWithClient`   |
| `lib/authz.ts`                            | `authorizeResource` — verifies resource belongs to user's site            | `.eq("site_id", ...)` on resource table                   |
| `lib/click-queue.ts`                      | Queue consumer writes clicks — no request context available               | `site_id` from queue message payload                      |
| `lib/dal/stripe-events.ts`                | Stripe webhook RPC — no request context, cross-tenant by design           | `p_stripe_event_id` RPC handles scoping internally        |
| `app/api/queue/clicks/route.ts`           | Queue consumer — same as click-queue.ts                                   | `site_id` from queue message                              |
| `app/api/cron/ai-generate/route.ts`       | Cross-tenant cron — iterates all sites                                    | Loops over `allSites`, each iteration scoped to one site  |
| `app/api/cron/click-reconcile/route.ts`   | Cross-tenant cron — reconciles click counts                               | Loops over sites from DB query                            |
| `app/api/cron/commission-ingest/route.ts` | Cross-tenant cron — ingests affiliate network data                        | Per-site loop with `site_id` filter                       |
| `app/api/cron/data-retention/route.ts`    | Cross-tenant cron — GDPR retention purge                                  | Per-table purge with `site_id` WHERE clause               |
| `app/api/cron/epc-recompute/route.ts`     | Cross-tenant cron — recomputes EPC metrics                                | Per-site loop                                             |
| `app/api/cron/expire-deals/route.ts`      | Cross-tenant cron — expires deals                                         | `expireDeals()` filters by site                           |
| `app/api/cron/price-scrape/route.ts`      | Cross-tenant cron — scrapes product prices                                | Per-site loop with site-scoped DAL                        |
| `app/api/cron/publish/route.ts`           | Cross-tenant cron — publishes scheduled content                           | Per-site loop                                             |
| `app/api/cron/sitemap-refresh/route.ts`   | Cross-tenant cron — refreshes sitemaps                                    | Per-site loop                                             |
| `app/api/cron/stripe-sync/route.ts`       | Cross-tenant cron — syncs Stripe events                                   | Per-event processing with site_id from event metadata     |

## Test-only call sites

| File                                             | Notes                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| `__tests__/deep-audit-locks.test.ts`             | Verifies service-role allowlist                 |
| `__tests__/admin-routes-no-service-role.test.ts` | Verifies admin routes don't import service-role |
| `__tests__/integration/*.test.ts`                | Integration tests with mock Supabase            |
| `__tests__/cross-tenant-authz.test.ts`           | Cross-tenant authorization tests                |
| `__tests__/stripe-event-processor.test.ts`       | Stripe event processor tests                    |

## Gateway

All access flows through `lib/server-only/service-role.ts` which is the
single gateway. An ESLint `no-restricted-imports` rule prevents direct
imports from `@supabase/supabase-js` in application code.

## Branded SiteId type

A branded `SiteId` type is defined in `lib/dal/dal-client.ts` to make
it a type error to pass an unvalidated string where a verified site ID
is required. DAL functions that use the privileged client must accept
`SiteId` as their first argument (or a `getClient` callback that
receives one).

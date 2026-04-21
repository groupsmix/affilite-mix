# Public RLS Policy Inventory

> Originally generated as part of the tenant-binding audit (task 5.1).
> Last updated: 2026-04-21 (post-00035 + 00038 + 00039, aligned with prod numbering)

## Summary

Every table with Row-Level Security enabled is listed below. Since
migration **00035** (drops all public SELECT policies + REVOKEs SELECT
from `anon` on every tenant-scoped table), **00038** (drops any
residual anon INSERT policies on telemetry tables + REVOKEs INSERT from
`anon`), and **00039** (second-pass cleanup for historical public SELECT
policy names that 00035 didn't cover), **the `anon` role has no direct
read or write access to any public-schema table**. All public-facing
data is served via server-side DAL functions that use the service-role
client from `lib/supabase-server.ts` (`getServiceClient()`).

### Tables with public-read SELECT policies

**None.** Migration 00035 dropped the 7 previously-public read policies
(`public_read_sites`, `public_read_categories`,
`public_read_active_products`, `public_read_published_content`,
`public_read_content_products`, `public_read_published_pages`,
`ad_placements_public_read`) and REVOKEd `SELECT` on each of those
tables from the `anon` role. Migration 00039 then swept any remaining
historical public SELECT policy names that 00035 didn't cover by
explicit `DROP POLICY IF EXISTS` (idempotent).

Historical detail: the pre-00035 policies all included an active-site
guard (`EXISTS (sites WHERE id = site_id AND is_active)` — added in
migrations 00024 + 00031), so the removal did not tighten access for
deactivated sites — it tightened access for **every** site, moving
public reads fully behind the server-side API.

### Tables with public-write (INSERT) policies

**None.** Production audit (2026-04-21) confirmed that neither
`public_insert_ad_impressions` (`ad_impressions`) nor
`web_vitals_anon_insert` (`web_vitals`) exists on the live database.
Migration 00038 codifies this in the repo by explicitly dropping both
policies plus all known historical variants (`Allow anonymous inserts`,
`ad_impressions_public_insert`, `Public can insert ad impressions`) and
REVOKEing `INSERT` from `anon` on both tables.

Both telemetry writers already use the service role:

| Table            | Server endpoint                                      | Client used          |
| ---------------- | ---------------------------------------------------- | -------------------- |
| `web_vitals`     | `app/api/vitals/route.ts`                            | `getServiceClient()` |
| `ad_impressions` | `lib/dal/ad-impressions.ts` → `recordAdImpression()` | `getServiceClient()` |

### Tables with NO public access (service-role only)

All operations (SELECT, INSERT, UPDATE, DELETE) require `auth.role() = 'service_role'`.

| #   | Table                    | Policy Name                          |
| --- | ------------------------ | ------------------------------------ |
| 1   | `admin_users`            | `service_full_access_admin_users`    |
| 2   | `affiliate_clicks`       | `service_full_access_clicks`         |
| 3   | `newsletter_subscribers` | `service_full_access_newsletter`     |
| 4   | `scheduled_jobs`         | `service_full_access_scheduled_jobs` |
| 5   | `ad_placements`          | `service_full_access_ad_placements`  |
| 6   | `shared_content`         | `service_full_access_shared_content` |
| 7   | `audit_log`              | `service_full_access_audit_log`      |
| 8   | `niche_templates`        | `niche_templates_service_all`        |
| 9   | `site_modules`           | `site_modules_service_all`           |
| 10  | `site_feature_flags`     | `site_feature_flags_service_all`     |
| 11  | `roles`                  | `roles_service_all`                  |
| 12  | `permissions`            | `permissions_service_all`            |
| 13  | `role_permissions`       | `role_permissions_service_all`       |
| 14  | `user_site_roles`        | `user_site_roles_service_all`        |
| 15  | `integration_providers`  | `integration_providers_service_all`  |
| 16  | `site_integrations`      | `site_integrations_service_all`      |
| 17  | `ai_drafts`              | `ai_drafts_service_all`              |
| 18  | `affiliate_networks`     | `affiliate_networks_service_all`     |
| 19  | `admin_site_memberships` | `admin_site_memberships_service_all` |

## Tenant-binding analysis

With no public read or write policies on any tenant-scoped table, the
`anon` role cannot reach application data directly. Tenant isolation on
the server side is enforced by DAL helpers (`lib/dal/*.ts`) that
accept an explicit `siteId` argument and scope every query by it.

### Previously removed public policies

| Policy                              | Table                    | Removed in |
| ----------------------------------- | ------------------------ | ---------- |
| `public_insert_clicks`              | `affiliate_clicks`       | 00034      |
| `public_insert_newsletter`          | `newsletter_subscribers` | 00034      |
| `site_modules_public_read`          | `site_modules`           | 00033      |
| `site_feature_flags_public_read`    | `site_feature_flags`     | 00033      |
| `roles_public_read`                 | `roles`                  | 00033      |
| `permissions_public_read`           | `permissions`            | 00033      |
| `role_permissions_public_read`      | `role_permissions`       | 00033      |
| `integration_providers_public_read` | `integration_providers`  | 00033      |
| `public_read_sites`                 | `sites`                  | 00037      |
| `public_read_categories`            | `categories`             | 00037      |
| `public_read_active_products`       | `products`               | 00037      |
| `public_read_published_content`     | `content`                | 00037      |
| `public_read_content_products`      | `content_products`       | 00037      |
| `public_read_published_pages`       | `pages`                  | 00037      |
| `ad_placements_public_read`         | `ad_placements`          | 00037      |
| `public_insert_ad_impressions`      | `ad_impressions`         | 00038      |
| `web_vitals_anon_insert`            | `web_vitals`             | 00038      |

## Recommendations

All recommendations from the original inventory have been addressed:

1. ~~Add `sites.is_active = true` to `public_insert_ad_impressions`~~ —
   obsolete: the policy was removed entirely (migration 00038) and
   impression writes go through `recordAdImpression()` under the
   service role.
2. ~~Add a `site_id` column to `web_vitals` and tenant-bind INSERTs~~ —
   obsolete: the policy was removed entirely (migration 00038) and
   vitals writes go through `app/api/vitals/route.ts` under the
   service role.
3. ~~All public-read policies on tenant tables include the
   `sites.is_active` guard~~ — obsolete: the public-read policies no
   longer exist (migration 00037); public reads now go through server
   routes that query under the service role.

Future work: consider adding a CI check that fails if any policy on a
public-schema table grants `anon` or `authenticated` any privilege
beyond what is documented here.

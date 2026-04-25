# Public RLS Policy Inventory

> Originally generated as part of the tenant-binding audit (task 5.1).
> Last updated: 2026-04-21 (post-00040: defense-in-depth service-role policies for admin_users, sites, and 8 platform-config tables)

## Summary

Every table with Row-Level Security enabled is listed below.

**Update (F-002 Fix):** Migration **00038_reintroduce_public_rls** re-granted `SELECT` access to the `anon` role for public-facing tables (`sites`, `categories`, `products`, `content`, `pages`, `content_products`, `ad_placements`) and reinstated strict RLS policies. The Data Access Layer (DAL) for public pages now uses `getAnonClient()` to enforce tenant isolation at the database level, preventing cross-tenant data leaks in the event of an application-layer bug.

### Tables with public-read SELECT policies

The following tables have `SELECT` access granted to the `anon` role, protected by strict RLS policies that enforce `is_active = true` and `status = 'published'/'active'`:

- `sites` (`public_read_sites`)
- `categories` (`public_read_categories`)
- `products` (`public_read_active_products`)
- `content` (`public_read_published_content`)
- `pages` (`public_read_published_pages`)
- `content_products` (`public_read_content_products`)
- `ad_placements` (`ad_placements_public_read`)

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
| 1   | `admin_users`            | `admin_users_service_all`            |
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
| 20  | `sites`                  | `sites_service_all`                  |

## Tenant-binding analysis

Tenant isolation is enforced by strict RLS policies on the database side (checking `site_id` and `sites.is_active = true`), and the public Data Access Layer (`lib/dal/*.ts`) queries data using the `anon` client (`getAnonClient()`). This provides defense-in-depth: if a DAL function accidentally omits a `site_id` filter, the database RLS will still block unauthorized cross-tenant reads.

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

## Live-DB audit (E-6)

`scripts/db-audit.sh` runs the audit queries codified from this
document against a live database (staging by default) and exits
non-zero if any of the following invariants are violated:

- **[A]** the `anon` role holds any table privilege
  (SELECT / INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER)
  on ANY public-schema table,
- **[B]** any RLS policy on a public-schema table names `anon` in its
  `roles` array, or
- **[C]** any RLS policy on a public-schema table uses
  `FOR ALL USING (true)` without a `service_role` scope (this
  complements the static check in `scripts/check-migrations.sh` by
  catching drift between migration history and the live DB).

The script is invoked by the `RLS audit (E-6)` job in
`.github/workflows/ci.yml`, gated on the `STAGING_SUPABASE_DB_URL`
repo secret. When the secret is unset the script exits 0 with a
warning so PRs from forks do not fail.

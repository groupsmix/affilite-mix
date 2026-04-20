# Public RLS Policy Inventory

> Generated as part of the tenant-binding audit (task 5.1).
> Last updated: 2026-04-20

## Summary

Every table with Row-Level Security enabled is listed below. Tables are grouped
by whether they expose **public-read** policies (accessible via the Supabase
anon key) or are **service-role only** (no anon access).

### Tables with public-read SELECT policies

| #   | Table              | Policy Name                     | Condition                                                                                       | Tenant-bound?                                             |
| --- | ------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `sites`            | `public_read_sites`             | `is_active = true`                                                                              | N/A (root table)                                          |
| 2   | `categories`       | `public_read_categories`        | `EXISTS (sites WHERE id = site_id AND is_active)`                                               | Yes — via active site check                               |
| 3   | `products`         | `public_read_active_products`   | `status = 'active' AND EXISTS (sites WHERE id = site_id AND is_active)`                         | Yes — via active site check (hardened in migration 00031) |
| 4   | `content`          | `public_read_published_content` | `status = 'published' AND EXISTS (sites WHERE id = site_id AND is_active)`                      | Yes — via active site check (hardened in migration 00031) |
| 5   | `content_products` | `public_read_content_products`  | `EXISTS (content published) AND EXISTS (products active) AND EXISTS (sites active via content)` | Yes — transitive via content + products + site            |
| 6   | `pages`            | `public_read_published_pages`   | `is_published = true AND EXISTS (sites WHERE id = site_id AND is_active)`                       | Yes — via active site check (hardened in migration 00031) |

### Tables with public-write (INSERT) policies

| #   | Table            | Policy Name                    | Condition                                     | Notes                                                                                                              |
| --- | ---------------- | ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `ad_impressions` | `public_insert_ad_impressions` | `EXISTS (sites WHERE id = site_id)`           | Allows anon to record impressions for valid sites                                                                  |
| 2   | `web_vitals`     | `web_vitals_anon_insert`       | `true` (with CHECK constraints on name/value) | Anon can insert; constrained by `web_vitals_name_not_empty` and `web_vitals_value_finite_nonneg` (migration 00033) |

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

### Already tenant-bound (hardened in migrations 00024 + 00031)

- **products**, **content**, **pages**: Public reads require `sites.is_active = true` via an EXISTS sub-select on `site_id`. Deactivating a site immediately hides all its public-facing rows.
- **categories**: Tenant-bound via `sites.is_active` check since migration 00024.
- **content_products**: Transitively bound through both `content` (published + active site) and `products` (active + active site).

### Not tenant-scoped (by design)

- **sites**: The `public_read_sites` policy returns all active sites. This is intentional — public pages need to enumerate sites for navigation, domain resolution, etc. No per-tenant filter is needed here since the table IS the tenant registry.
- **web_vitals**: Anonymous insert with no site_id scoping. This is a telemetry table for Core Web Vitals metrics. Migration 00033 added CHECK constraints to reject malformed payloads.
- **ad_impressions**: Anonymous insert scoped by valid `site_id`. The site must exist in the `sites` table.

### Previously removed public policies (migration 00033 + 00034)

- `public_insert_clicks` on `affiliate_clicks` — **removed** in migration 00034
- `public_insert_newsletter` on `newsletter_subscribers` — **removed** in migration 00034
- `site_modules_public_read` — **removed** in migration 00033
- `site_feature_flags_public_read` — **removed** in migration 00033
- `roles_public_read` — **removed** in migration 00033
- `permissions_public_read` — **removed** in migration 00033
- `role_permissions_public_read` — **removed** in migration 00033
- `integration_providers_public_read` — **removed** in migration 00033

## Recommendations

1. **`ad_impressions` INSERT**: Consider adding `sites.is_active = true` to the
   WITH CHECK to prevent impression recording for deactivated sites.
2. **`web_vitals` INSERT**: Consider adding a `site_id` column and tenant-binding
   to prevent abuse of this open-insert table.
3. All public-read policies on tenant tables now include the `sites.is_active`
   guard, which is the correct pattern for this multi-tenant architecture.

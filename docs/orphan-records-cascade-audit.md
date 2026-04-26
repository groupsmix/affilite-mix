# Orphan Records & Cascade Audit

Audit reference: production-readiness checklist item **#49 — Check orphan records and cascades**.

This document is the canonical record of which referential constraints exist between the high-traffic tables, what their `ON DELETE` behaviour is, and whether the design admits orphan rows. It exists so future schema changes can be reviewed against an explicit baseline rather than re-derived from the migration history each time.

The findings below were derived from `supabase/migrations/*.sql` (the authoritative source per [`supabase.md`](./supabase.md)) at the time `00065_add_actor_user_id.sql` was the latest applied migration. Re-run the queries in **§ Verification** against the live database after any schema change to confirm the policy is still in force.

---

## 1. Summary table

`CASCADE` = child rows are deleted when the parent is deleted.
`SET NULL` = child rows are kept; the FK column is nulled.
`—` = no foreign key (intentional denormalisation).

| Child table               | Column            | Parent                  | On delete | Source migration                                      | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------- | ----------------------- | --------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`              | `site_id`         | `sites`                 | CASCADE   | `00001_initial_schema.sql`                            | Per-site taxonomy. Deleting a site removes its categories.                                                                                                                                                                                                                                                                                                              |
| `products`                | `site_id`         | `sites`                 | CASCADE   | `00001_initial_schema.sql`                            | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `products`                | `category_id`     | `categories`            | SET NULL  | `00021_on_delete_set_null_category.sql`               | Was previously a hard CASCADE; changed to preserve products if a category is removed.                                                                                                                                                                                                                                                                                   |
| `content`                 | `site_id`         | `sites`                 | CASCADE   | `00001_initial_schema.sql`                            | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `content`                 | `category_id`     | `categories`            | SET NULL  | `00021_on_delete_set_null_category.sql`               | See above — categories may be reorganised without losing articles.                                                                                                                                                                                                                                                                                                      |
| `content`                 | `author_id`       | `authors`               | SET NULL  | `00043_authors_and_affiliate_links.sql`               | Author rotation must not delete published articles.                                                                                                                                                                                                                                                                                                                     |
| `content_products`        | `content_id`      | `content`               | CASCADE   | `00001_initial_schema.sql`                            | Join table; safe to cascade.                                                                                                                                                                                                                                                                                                                                            |
| `content_products`        | `product_id`      | `products`              | CASCADE   | `00001_initial_schema.sql`                            | Join table; safe to cascade.                                                                                                                                                                                                                                                                                                                                            |
| `affiliate_clicks`        | `site_id`         | `sites`                 | CASCADE   | `00001_initial_schema.sql`                            | Tenant scope; clicks belong to a site.                                                                                                                                                                                                                                                                                                                                  |
| `affiliate_clicks`        | `product_name`    | —                       | —         | `00001_initial_schema.sql`                            | **No FK to `products`.** Click rows store the product name and affiliate URL as denormalised text so historical click data survives product deletion.                                                                                                                                                                                                                   |
| `product_affiliate_links` | `product_id`      | `products`              | CASCADE   | `00043_authors_and_affiliate_links.sql`               | One affiliate URL per `(product, network, geo)`.                                                                                                                                                                                                                                                                                                                        |
| `commissions`             | `site_id`         | `sites`                 | CASCADE   | `00048_commissions_and_epc.sql`                       | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `commissions`             | `product_id`      | `products`              | SET NULL  | `00048_commissions_and_epc.sql`                       | Commission history is intentionally preserved if a product is removed; finance audit trail.                                                                                                                                                                                                                                                                             |
| `commissions`             | `network`         | —                       | —         | `00048_commissions_and_epc.sql`                       | `network` is a `TEXT CHECK` enum (`'cj' \| 'admitad' \| 'partnerstack' \| 'direct'`), not an FK. There is no separate `affiliate_programs` table — `affiliate_networks` holds **per-site config** keyed by `(site_id, network)` and is intentionally not referenced from `commissions`, so a site disabling a network does not silently destroy its accounting history. |
| `product_epc_stats`       | `product_id`      | `products`              | CASCADE   | `00048_commissions_and_epc.sql`                       | Materialised per-product EPC; safe to recompute, so cascade is fine.                                                                                                                                                                                                                                                                                                    |
| `price_snapshots`         | `product_id`      | `products`              | CASCADE   | `00046_price_snapshots_and_alerts.sql`                | Time-series; tied to product lifecycle.                                                                                                                                                                                                                                                                                                                                 |
| `price_snapshots`         | `site_id`         | `sites`                 | CASCADE   | `00046_price_snapshots_and_alerts.sql`                | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `price_alerts`            | `product_id`      | `products`              | CASCADE   | `00046_price_snapshots_and_alerts.sql`                | Subscription is meaningless without the product; cascade is correct.                                                                                                                                                                                                                                                                                                    |
| `price_alerts`            | `site_id`         | `sites`                 | CASCADE   | `00046_price_snapshots_and_alerts.sql`                | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `price_alerts`            | `email`           | —                       | —         | `00046_price_snapshots_and_alerts.sql`                | **No FK to a `users` table.** Price alerts are anonymous email subscriptions, not authenticated users. There is no end-user account model on this platform; admins live in `admin_users`, paying members live in `memberships`, and alerts live independently.                                                                                                          |
| `memberships`             | `site_id`         | `sites`                 | CASCADE   | `00051_memberships.sql`                               | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `memberships`             | `email`           | —                       | —         | `00051_memberships.sql`                               | **No FK to `admin_users`.** Memberships are end-user paid subscriptions identified by email + site, not admin accounts. Treating them as admins would be a confused-deputy bug — keep them separate.                                                                                                                                                                    |
| `comments`                | `site_id`         | `sites`                 | CASCADE   | `00050_community_ugc.sql`                             | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `comments`                | `parent_id`       | `comments`              | CASCADE   | `00050_community_ugc.sql`                             | Self-referential thread; deleting a parent comment removes replies.                                                                                                                                                                                                                                                                                                     |
| `reviews`                 | `site_id`         | `sites`                 | CASCADE   | `00050_community_ugc.sql`                             | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `reviews`                 | `product_id`      | `products`              | SET NULL  | `00050_community_ugc.sql`                             | Reviews can outlive the product they were written for.                                                                                                                                                                                                                                                                                                                  |
| `quizzes`                 | `site_id`         | `sites`                 | CASCADE   | `00047_quiz_funnel.sql`                               | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `quiz_submissions`          | `quiz_id`         | `quizzes`               | CASCADE   | `00047_quiz_funnel.sql`                               | Submissions are meaningless without the quiz definition.  ... [truncated]
| `drip_campaigns`          | `trigger_quiz_id` | `quizzes`               | SET NULL  | `00047_quiz_funnel.sql`                               | Quiz can be removed without breaking the campaign.                                                                                                                                                                                                                                                                                                                      |
| `drip_messages`           | `campaign_id`     | `drip_campaigns`        | CASCADE   | `00047_quiz_funnel.sql`                               | Messages live with their campaign.                                                                                                                                                                                                                                                                                                                                      |
| `experiments`             | `site_id`         | `sites`                 | CASCADE   | `00052_ab_testing_and_review_state.sql`               | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `experiment_*`            | `experiment_id`   | `experiments`           | CASCADE   | `00052_ab_testing_and_review_state.sql`               | All experiment children cascade.                                                                                                                                                                                                                                                                                                                                        |
| `ad_placements`           | `site_id`         | `sites`                 | CASCADE   | `00015_ad_placements.sql`                             | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `ad_impressions`          | `ad_placement_id` | `ad_placements`         | CASCADE   | `00017_ad_impressions.sql`                            | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `shared_content`          | `content_id`      | `content`               | CASCADE   | `00018_shared_content.sql`                            | Cross-tenant share record removed when source content is removed.                                                                                                                                                                                                                                                                                                       |
| `audit_log`               | `site_id`         | `sites`                 | SET NULL  | `00001_initial_schema.sql`                            | Audit log must outlive deleted sites/users — never cascade.                                                                                                                                                                                                                                                                                                             |
| `audit_log`               | `user_id`         | `admin_users`           | SET NULL  | `00001_initial_schema.sql`                            | Same reasoning.                                                                                                                                                                                                                                                                                                                                                         |
| `audit_log`               | `actor_user_id`   | `admin_users`           | SET NULL  | `00065_add_actor_user_id.sql`                         | Same reasoning.                                                                                                                                                                                                                                                                                                                                                         |
| `audit_log`               | `content_id`      | `content`               | SET NULL  | `00041_critical_schema_reconciliation.sql`            | Same reasoning.                                                                                                                                                                                                                                                                                                                                                         |
| `admin_site_memberships`  | `admin_user_id`   | `admin_users`           | CASCADE   | `00036_admin_site_memberships.sql`                    | Removing an admin removes their site bindings.                                                                                                                                                                                                                                                                                                                          |
| `admin_site_memberships`  | `site_id`         | `sites`                 | CASCADE   | `00036_admin_site_memberships.sql`                    | Removing a site removes its admin bindings.                                                                                                                                                                                                                                                                                                                             |
| `admin_site_memberships`  | `role_id`         | `roles`                 | CASCADE   | `00036_admin_site_memberships.sql`                    | Roles are not deleted in steady state; a role removal must take its bindings with it.                                                                                                                                                                                                                                                                                   |
| `role_permissions`        | `role_id`         | `roles`                 | CASCADE   | `00028_platform_modules_permissions_integrations.sql` | Junction table.                                                                                                                                                                                                                                                                                                                                                         |
| `role_permissions`        | `permission_id`   | `permissions`           | CASCADE   | `00028_platform_modules_permissions_integrations.sql` | Junction table.                                                                                                                                                                                                                                                                                                                                                         |
| `site_integrations`       | `site_id`         | `sites`                 | CASCADE   | `00028_platform_modules_permissions_integrations.sql` | Tenant scope.                                                                                                                                                                                                                                                                                                                                                           |
| `site_integrations`       | `provider_key`    | `integration_providers` | CASCADE   | `00028_platform_modules_permissions_integrations.sql` | Provider removal sweeps integrations.                                                                                                                                                                                                                                                                                                                                   |

---

## 2. Findings against the audit checklist

The audit item asked us to verify foreign keys for these specific edges:

### `products → sites`

**OK.** `products.site_id NOT NULL REFERENCES sites(id) ON DELETE CASCADE`. Products are tenant-scoped and removing a site correctly removes the catalogue.

### `content → sites`

**OK.** `content.site_id NOT NULL REFERENCES sites(id) ON DELETE CASCADE`. Same reasoning as products.

### `clicks → products`

**No FK by design.** `affiliate_clicks` references `sites(id)` (CASCADE) but stores `product_name` and `affiliate_url` as denormalised text. This is intentional — click history is the input to the EPC pipeline (`product_epc_stats`) and to revenue reporting, and must survive product deletion. The referential integrity is enforced upstream at write time (the click handler refuses to write a row whose `affiliate_url` does not match a known product affiliate link), not at the database level.

> **If a future schema change adds a `product_id` column to `affiliate_clicks`**, it MUST be `ON DELETE SET NULL`, not `CASCADE`. Cascading would silently destroy click history and break commission reconciliation.

### `commissions → affiliate programs / products`

**Mixed; correct.**

- `commissions.product_id REFERENCES products(id) ON DELETE SET NULL` — preserves the commission record so finance reports remain accurate even after a product is removed.
- `commissions.network` is a `TEXT CHECK` enum, not an FK. There is no `affiliate_programs` table; the closest analog is `affiliate_networks`, which holds per-site **configuration** (publisher IDs, API key references) and is intentionally not referenced from `commissions`. A site disabling a network row in `affiliate_networks` MUST NOT remove its historical commission data.

### `alerts → users / products`

**Correct given the data model.**

- `price_alerts.product_id` is `ON DELETE CASCADE`. An alert subscription for a product that no longer exists cannot fire, so cascading is the right behaviour.
- There is **no `users` table** on this platform; alerts identify subscribers by email. `price_alerts.email` is therefore a plain `TEXT NOT NULL` field, not a FK. If a future change introduces a registered-user model, alerts should join through email rather than be cascaded — losing somebody's alert subscription because of a separate user-account event would be surprising and is not currently a documented behaviour.

### `memberships → admins / sites`

**Correct.** `memberships` are end-user paid subscriptions; they have no relationship to `admin_users`. Linking them to `admin_users` would be a confused-deputy mistake. The schema correctly:

- CASCADEs on `site_id` (a paid-membership product cannot exist without its site)
- keeps `email` as a free text field with a `(email, site_id) WHERE status = 'active'` partial unique index, not an FK.

---

## 3. Verification queries

Run these against the production database (read-only) after any schema change to verify the policy above still holds.

### 3.1 List every foreign key with its `ON DELETE` action

```sql
SELECT
  conrelid::regclass        AS child_table,
  a.attname                 AS child_column,
  confrelid::regclass       AS parent_table,
  af.attname                AS parent_column,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint c
JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = ANY(c.conkey)
JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
WHERE c.contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY child_table, child_column;
```

### 3.2 Check for actual orphan rows

The denormalised columns in `affiliate_clicks` and the `email` columns in `price_alerts` / `memberships` are not enforced by foreign keys, so they may legitimately point at deleted parents. The queries below report rows whose denormalised reference no longer matches any live row — useful for periodic data-quality dashboards, NOT a correctness check.

```sql
-- Clicks whose affiliate_url no longer matches any active product link
SELECT COUNT(*) AS orphan_clicks
FROM affiliate_clicks ac
LEFT JOIN product_affiliate_links pal
  ON pal.url = ac.affiliate_url
WHERE pal.id IS NULL;

-- Price alerts whose product no longer exists (should be 0 — CASCADE handles this)
SELECT COUNT(*) AS orphan_price_alerts
FROM price_alerts pa
LEFT JOIN products p ON p.id = pa.product_id
WHERE p.id IS NULL;

-- Memberships pointing at deleted sites (should be 0 — CASCADE handles this)
SELECT COUNT(*) AS orphan_memberships
FROM memberships m
LEFT JOIN sites s ON s.id = m.site_id
WHERE s.id IS NULL;

-- Commissions whose product was removed; product_id is SET NULL on delete,
-- so this query reports the active business question "how much commission
-- belongs to deleted catalogue items?" rather than a data-integrity issue.
SELECT
  COUNT(*) AS commissions_for_deleted_products,
  SUM(commission_amount) AS amount_for_deleted_products
FROM commissions
WHERE product_id IS NULL;
```

### 3.3 Cross-tenant leak check

A regression where a child table forgot its `site_id` cascade would let one tenant see another tenant's children. This query enumerates every row whose `site_id` does not match its parent's `site_id` — should always return zero rows.

```sql
SELECT 'content_products' AS rel, cp.content_id, cp.product_id
FROM content_products cp
JOIN content  c ON c.id = cp.content_id
JOIN products p ON p.id = cp.product_id
WHERE c.site_id <> p.site_id;
```

If any row appears, escalate as a P0 — the per-tenant RLS guarantees described in [`docs/public-rls-inventory.md`](./public-rls-inventory.md) depend on `content_products` rows being intra-tenant.

---

## 4. Change protocol

Any migration that adds, drops, or alters a foreign key MUST:

1. Update the table in **§ 1** in the same PR.
2. Re-run query **§ 3.1** against staging and paste the row(s) for the affected table(s) into the PR description as evidence the change took effect.
3. If introducing a new "weak link" (a column that semantically points at another table without an FK), add a row with `—` to the table and explain the rationale here, plus add a verification query to **§ 3.2**.

This file is the single source of truth for the cascade policy. Drift between it and the live schema is a PR-blocker.

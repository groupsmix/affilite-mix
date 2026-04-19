# Database Migrations

All SQL migrations are numbered sequentially. Apply them in order against your Supabase project using the SQL Editor or `psql`.

## Migration Order

| File | Description |
|---|---|
| `00001_initial_schema.sql` | Tables, indexes, RLS policies, RPC functions, and seed data |
| `00002_admin_users.sql` | Per-user admin accounts table |
| `00003_rls_defense_in_depth.sql` | Additional RLS policies and audit log table |
| `00004_newsletter_double_optin.sql` | Double opt-in columns for newsletter subscribers |
| `00005_image_alt.sql` | `image_alt` column on products table |
| `00006_analytics_rpc.sql` | Postgres RPC functions for analytics aggregation |
| `00007_taxonomy_type.sql` | `taxonomy_type` column on categories + seed taxonomy data |
| `00008_add_scheduled_status.sql` | Add `scheduled` to content status CHECK constraint |
| `00009_add_reset_token_columns.sql` | Password reset token columns on admin_users |
| `00010_add_price_columns.sql` | `price_amount` and `price_currency` columns on products |
| `00011_add_is_active_to_sites.sql` | `is_active` column on sites table |
| `00012_content_versioning.sql` | `body_previous` column on content for version history |
| `00013_comprehensive_sites_schema.sql` | Extended sites columns: theme, nav, features, SEO, social links |
| `00014_seed_config_sites.sql` | Seed rows for watch-tools, arabic-tools, and crypto-tools |
| `00015_ad_placements.sql` | `ad_placements` table for sidebar/in-content/header ad slots |
| `00016_add_missing_category_columns.sql` | `description`, `meta_title`, `meta_description` columns on categories |
| `00017_ad_impressions.sql` | `ad_impressions` table for daily impression counters per placement |
| `00018_shared_content.sql` | `shared_content` table for cross-site content syndication |
| `00019_niche_templates.sql` | `niche_templates` table with built-in launch presets |
| `00020_harden_rls_and_add_indexes.sql` | Replace USING(true) service policies with role-check; add composite indexes |
| `00021_on_delete_set_null_category.sql` | Change category FK on products/content to ON DELETE SET NULL |
| `00022_niche_health_rpc.sql` | `get_niche_health` RPC for per-site content/product health score |
| `00023_web_vitals_table.sql` | `web_vitals` table for Core Web Vitals beacon data |
| `00024_harden_public_rls_and_indexes.sql` | Tighten public RLS (require active site); add missing composite indexes |
| `00025_index_content_status_publish_at.sql` | Composite index on content(site_id, status, publish_at) for cron queries |
| `00026_reorder_pages_rpc.sql` | `reorder_pages` RPC for drag-and-drop page ordering |
| `00027_dashboard_stats_rpc.sql` | `get_dashboard_stats` RPC — replaces 15+ individual dashboard queries |
| `00028_platform_modules_permissions_integrations.sql` | site_modules, site_feature_flags, roles, permissions, role_permissions, user_site_roles, integration_providers, site_integrations tables |
| `00029_ai_drafts_and_affiliate_networks.sql` | `ai_drafts` and `affiliate_networks` tables; seed ai-compared site |
| `00030_newsletter_unsubscribe_tokens.sql` | `unsubscribe_token` column on newsletter_subscribers (opaque capability token) |
| `00031_harden_public_rls_active_site_check.sql` | Public read policies for products/content/pages/content_products require sites.is_active = true |

## How to Apply

### New database (fresh install)

Run all migrations in order:

```bash
for f in supabase/migrations/*.sql; do
  echo "Applying $f..."
  psql "$DATABASE_URL" -f "$f"
done
```

Or paste each file's contents into the Supabase SQL Editor, starting with `00001_initial_schema.sql`.

### Existing database

Identify which migrations have already been applied by checking which tables/columns exist, then apply only the remaining migrations in order.

All migrations use `IF NOT EXISTS` / `CREATE OR REPLACE` guards where possible, so re-running an already-applied migration is generally safe (idempotent). The production deploy workflow tracks applied migrations in a `_migrations_applied` ledger table to avoid re-running files unnecessarily.

## Adding New Migrations

1. Create a new file with the next sequential number: `00032_description.sql`
2. Use `IF NOT EXISTS` guards where possible for idempotency
3. Add the migration to the table above
4. Test against a development database before applying to production

# Database Migrations

All SQL migrations are numbered sequentially. Apply them in order against your Supabase project using the SQL Editor or `psql`.

## Migration Order

| File                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00000_baseline_repair.sql`                           | Baseline idempotent repair for projects manually set up before the numbered chain. Drops conflicting indexes/policies, fixes CHECK constraints, adds missing columns, drops `sites.domain` UNIQUE. Applied to prod; safe no-op on fresh DBs.                                                                                                                                                         |
| `00001_initial_schema.sql`                            | Tables, indexes, RLS policies, RPC functions, and seed data                                                                                                                                                                                                                                                                                                                                          |
| `00002_admin_users.sql`                               | Per-user admin accounts table                                                                                                                                                                                                                                                                                                                                                                        |
| `00003_rls_defense_in_depth.sql`                      | Additional RLS policies and audit log table                                                                                                                                                                                                                                                                                                                                                          |
| `00004_newsletter_double_optin.sql`                   | Double opt-in columns for newsletter subscribers                                                                                                                                                                                                                                                                                                                                                     |
| `00005_image_alt.sql`                                 | `image_alt` column on products table                                                                                                                                                                                                                                                                                                                                                                 |
| `00006_analytics_rpc.sql`                             | Postgres RPC functions for analytics aggregation                                                                                                                                                                                                                                                                                                                                                     |
| `00007_taxonomy_type.sql`                             | `taxonomy_type` column on categories + seed taxonomy data                                                                                                                                                                                                                                                                                                                                            |
| `00008_add_scheduled_status.sql`                      | Add `scheduled` to content status CHECK constraint                                                                                                                                                                                                                                                                                                                                                   |
| `00009_add_reset_token_columns.sql`                   | Password reset token columns on admin_users                                                                                                                                                                                                                                                                                                                                                          |
| `00010_add_price_columns.sql`                         | `price_amount` and `price_currency` columns on products                                                                                                                                                                                                                                                                                                                                              |
| `00011_add_is_active_to_sites.sql`                    | `is_active` column on sites table                                                                                                                                                                                                                                                                                                                                                                    |
| `00012_content_versioning.sql`                        | `body_previous` column on content for version history                                                                                                                                                                                                                                                                                                                                                |
| `00013_comprehensive_sites_schema.sql`                | Extended sites columns: theme, nav, features, SEO, social links                                                                                                                                                                                                                                                                                                                                      |
| `00014_seed_config_sites.sql`                         | Seed rows for watch-tools, arabic-tools, and crypto-tools                                                                                                                                                                                                                                                                                                                                            |
| `00015_ad_placements.sql`                             | `ad_placements` table for sidebar/in-content/header ad slots                                                                                                                                                                                                                                                                                                                                         |
| `00016_add_missing_category_columns.sql`              | `description`, `meta_title`, `meta_description` columns on categories                                                                                                                                                                                                                                                                                                                                |
| `00017_ad_impressions.sql`                            | `ad_impressions` table for daily impression counters per placement                                                                                                                                                                                                                                                                                                                                   |
| `00018_shared_content.sql`                            | `shared_content` table for cross-site content syndication                                                                                                                                                                                                                                                                                                                                            |
| `00019_niche_templates.sql`                           | `niche_templates` table with built-in launch presets                                                                                                                                                                                                                                                                                                                                                 |
| `00020_harden_rls_and_add_indexes.sql`                | Replace USING(true) service policies with role-check; add composite indexes                                                                                                                                                                                                                                                                                                                          |
| `00021_on_delete_set_null_category.sql`               | Change category FK on products/content to ON DELETE SET NULL                                                                                                                                                                                                                                                                                                                                         |
| `00022_niche_health_rpc.sql`                          | `get_niche_health` RPC for per-site content/product health score                                                                                                                                                                                                                                                                                                                                     |
| `00023_web_vitals_table.sql`                          | `web_vitals` table for Core Web Vitals beacon data                                                                                                                                                                                                                                                                                                                                                   |
| `00024_harden_public_rls_and_indexes.sql`             | Tighten public RLS (require active site); add missing composite indexes                                                                                                                                                                                                                                                                                                                              |
| `00025_index_content_status_publish_at.sql`           | Composite index on content(site_id, status, publish_at) for cron queries                                                                                                                                                                                                                                                                                                                             |
| `00026_reorder_pages_rpc.sql`                         | `reorder_pages` RPC for drag-and-drop page ordering                                                                                                                                                                                                                                                                                                                                                  |
| `00027_dashboard_stats_rpc.sql`                       | `get_dashboard_stats` RPC — replaces 15+ individual dashboard queries                                                                                                                                                                                                                                                                                                                                |
| `00028_platform_modules_permissions_integrations.sql` | site_modules, site_feature_flags, roles, permissions, role_permissions, user_site_roles, integration_providers, site_integrations tables                                                                                                                                                                                                                                                             |
| `00029_ai_drafts_and_affiliate_networks.sql`          | `ai_drafts` and `affiliate_networks` tables; seed ai-compared site                                                                                                                                                                                                                                                                                                                                   |
| `00030_newsletter_unsubscribe_tokens.sql`             | `unsubscribe_token` column on newsletter_subscribers (opaque capability token)                                                                                                                                                                                                                                                                                                                       |
| `00031_harden_public_rls_active_site_check.sql`       | Public read policies for products/content/pages/content_products require sites.is_active = true                                                                                                                                                                                                                                                                                                      |
| `00032_fix_dashboard_stats_rpc.sql`                   | Corrects `get_dashboard_stats` — removes invalid `cp.site_id` predicate from `content_no_products` subquery (content_products has no site_id column)                                                                                                                                                                                                                                                 |
| `00033_security_hardening_p0_p3.sql`                  | Security hardening batch (P0–P3): CHECK constraints on `web_vitals`, additional index + policy cleanups on public reads                                                                                                                                                                                                                                                                              |
| `00034_remove_public_anon_insert_policies.sql`        | Drops anon INSERT policies on `affiliate_clicks` and `newsletter_subscribers`; writes now service-role only                                                                                                                                                                                                                                                                                          |
| `00035_drop_public_select_policies.sql`               | Drops all 7 public SELECT policies; REVOKEs SELECT from `anon` on every tenant-scoped table. Application reads move to server-side DAL helpers using the service-role client.                                                                                                                                                                                                                        |
| `00036_admin_site_memberships.sql`                    | `admin_site_memberships` table + RLS + bootstrap seed granting every existing admin access to every existing site                                                                                                                                                                                                                                                                                    |
| `00037_ai_drafts_add_ai_model.sql`                    | Adds `ai_model` column (NOT NULL default '') to `ai_drafts` so each draft records the specific model, not just the provider                                                                                                                                                                                                                                                                          |
| `00038_harden_public_insert_policies.sql`             | Drops any residual anon INSERT policies on `ad_impressions` / `web_vitals` (`public_insert_ad_impressions`, `web_vitals_anon_insert`, `Allow anonymous inserts`, `ad_impressions_public_insert`, `Public can insert ad impressions`); REVOKEs INSERT from `anon` on both. All telemetry writes already use the service role.                                                                         |
| `00039_drop_legacy_public_select_policies.sql`        | Second-pass cleanup for any historical public SELECT policy names not already removed by 00035 (e.g. `Public read active products`, `public_select_sites`, `public_read_published_pages`). Idempotent DROP POLICY IF EXISTS + REVOKE SELECT.                                                                                                                                                         |
| `00040_add_missing_service_role_policies.sql`         | Defense-in-depth: adds explicit `*_service_all` policies to 10 tables that had RLS enabled with zero policies (`admin_users`, `sites`, `site_modules`, `site_feature_flags`, `roles`, `permissions`, `role_permissions`, `user_site_roles`, `integration_providers`, `site_integrations`). Zero runtime effect (service_role already bypasses RLS); aligns prod with `docs/public-rls-inventory.md`. |

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

## Keeping schema.sql and types/supabase.ts in sync

The repo has **two** files under `types/` with overlapping-looking names; only
one of them is regenerated from the live database:

| File                | Role                                                                                        | Regenerated from DB?  |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------- |
| `types/supabase.ts` | `Database` type consumed by `createClient<Database>()` in `lib/supabase*.ts`                | **Yes** (this script) |
| `types/database.ts` | Hand-curated app-level row types (`ProductRow`, `ContentRow`, `NewsletterSubscriberRow`, …) | No (hand-edited)      |

`supabase/schema.sql` and `types/supabase.ts` must always match the live
database. After applying new migrations:

```bash
# Regenerate both files from the live linked project
bash scripts/check-schema-drift.sh
```

Or manually:

```bash
supabase db dump --linked > supabase/schema.sql
supabase gen types typescript --linked > types/supabase.ts
git diff supabase/schema.sql types/supabase.ts   # review changes
git add supabase/schema.sql types/supabase.ts
git commit -m "chore: regenerate schema snapshot and types after migration XX"
```

> **Rule**: Never hand-edit `supabase/schema.sql` or `types/supabase.ts`.
> Always regenerate them from the live DB and commit the result.
> `types/database.ts` is hand-curated and NOT regenerated by this script.
> The `scripts/check-schema-drift.sh` script can be added to CI to enforce this.

## Duplicate Numeric Prefixes (Known)

Two prefix collisions exist in this directory and must be applied in
the order listed below (Supabase / `psql` apply files lexicographically,
so `00038_h…` is applied before `00038_r…` and `00039_c…` before
`00039_d…`). Renaming the files in-place would re-trigger them on
already-migrated environments, so the audit recommendation (R-5) is
addressed by:

1. Documenting the apply order here, and
2. Adding a CI check (`__tests__/migration-order.test.ts`) that fails
   if a _new_ migration introduces another collision.

| Order | File                                           | Notes                                                     |
| ----- | ---------------------------------------------- | --------------------------------------------------------- |
| 1     | `00038_harden_public_insert_policies.sql`      | Tightens anon insert policies                             |
| 2     | `00038_reintroduce_public_rls.sql`             | Restores public SELECTs that the harden migration removed |
| 3     | `00039_create_click_failures.sql`              | Adds the `click_failures` table                           |
| 4     | `00039_drop_legacy_public_select_policies.sql` | Drops obsolete policies superseded by 00038               |

If you fork this repo for a new tenant before the next major release,
prefer renumbering these to `00038a/00038b/00039a/00039b` _only_ on the
fresh environment.

## Rollback Playbook (audit R-5 + #46)

Each forward migration ships with a paired `*-down.sql` (stored in the sibling
`supabase/migrations-down/` directory, **not** beside the up-migration) whenever a
data-destructive or policy-changing operation is involved. To revert
the latest applied migration safely:

```bash
# 1. Snapshot the production DB (PITR is enabled but a fresh logical
#    backup is cheaper to test against).
supabase db dump --linked --file rollback-$(date +%Y%m%d-%H%M).sql

# 2. Apply the down file.
psql "$SUPABASE_DB_URL" -f supabase/migrations-down/<NN>_<name>-down.sql

# 3. Re-run the schema-drift script so types and snapshot match.
bash scripts/check-schema-drift.sh
```

Migrations that _only_ add idempotent objects (`CREATE INDEX IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`) do not require a down file. Every
RLS policy or constraint change MUST.

## Migration 00064 — 00067 RLS hardening

`00064_tenant_isolation_rls.sql` introduced a permissive
`tenant_isolation_auth_global_<table>` policy on every table without a
`site_id` column and an `IS NULL` fallback on every site-scoped table.
The audit's R-1 / R-2 / R-3 / R-8 findings flagged both as critical;
they are corrected by `00067_harden_tenant_isolation_rls.sql`. After
applying 00067:

- `admin_users`, `roles`, `permissions`, `role_permissions`,
  `audit_log`, `niche_templates`, `integration_providers`,
  `site_integrations`, `stripe_events`, and `user_site_roles` are
  service*role-only with an explicit `authenticated_no_access*<t>`
  deny policy.
- `tenant_isolation_auth_<t>` requires `app_metadata.site_id` to be
  present _and_ equal to the row's `site_id`. The legacy `IS NULL`
  fallback is removed.
- `public.current_request_site_id()` exposes the canonical resolution
  rule for use in custom policies.

Rollback: `00067_harden_tenant_isolation_rls-down.sql` restores the
00064 behaviour. Use only as a last-resort emergency revert and re-apply
00067 immediately afterwards.

## Migrations 00081 — 00085 — Deep-audit follow-ups

This batch implements the code-side items of the deep audit
(see `docs/supabase-audit-followup.md` for the full runbook).

| Migration                                     | Audit ref | Purpose                                                                                                                                               |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00081_stripe_events_created_at.sql`          | S-06 (P0) | Restore `stripe_events.created_at`; backfill from `received_at`; add btree index. Resolves the schema drift between the webhook processor and the DB. |
| `00082_rls_initplan_optimisation.sql`         | S-07 (P1) | Walks `pg_policies` and rewrites every public-schema policy using `auth.<x>()` / `current_request_site_id*()` to wrap calls in `(select …)`.          |
| `00083_lock_security_definer_search_path.sql` | S-08 (P1) | Pins `search_path` on every `public` function and locks SECURITY DEFINER functions to `service_role` only.                                            |
| `00084_lock_migrations_applied_rls.sql`       | S-09 (P1) | Drops the open authenticated policy on `_migrations_applied`; restricts to service_role.                                                              |
| `00085_extend_retention_purge.sql`            | S-10 (P1) | Extends `purge_retention()` to cover `newsletter_subscribers`, `quiz_submissions`, `comments`, `web_vitals`. See `docs/ropa.md` for the windows.      |

Each migration ships an idempotent up-file (`DROP POLICY IF EXISTS` /
`ADD COLUMN IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`) and a
matching down-file. A dedicated CI gate
(`scripts/check-migrations.sh`, extended in this batch) prevents future
migrations from regressing the patterns these files enforce.

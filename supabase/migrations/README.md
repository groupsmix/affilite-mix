# Database Migrations

Migrations are numbered sequentially and should be applied in order.

| File | Description |
|------|-------------|
| `00001_initial_schema.sql` | Base schema: sites, categories, products, content, clicks, newsletter |
| `00002_admin_users.sql` | Admin user accounts with PBKDF2 password hashing |
| `00003_rls_defense_in_depth.sql` | RLS policies for all tables + audit_log table |
| `00004_newsletter_double_optin.sql` | Double opt-in columns for newsletter subscribers |
| `00005_image_alt.sql` | Image alt text column on products |
| `00006_analytics_rpc.sql` | Postgres RPC functions for analytics aggregation |
| `00007_taxonomy_type.sql` | Taxonomy type column on categories + seed data |
| `00008_add_scheduled_status.sql` | Add 'scheduled' to content status CHECK constraint |
| `00009_add_reset_token_columns.sql` | Password reset token columns on admin_users |
| `00010_add_price_columns.sql` | Numeric price columns on products |
| `00011_add_is_active_to_sites.sql` | is_active flag on sites table |

## How to apply

Run each migration file in order against your Supabase database using the SQL Editor or `psql`:

```bash
psql "$DATABASE_URL" -f supabase/migrations/00001_initial_schema.sql
# ... repeat for each numbered file
```

Migrations are idempotent (`IF NOT EXISTS`, `IF NOT EXISTS`) where possible, so re-running is safe.

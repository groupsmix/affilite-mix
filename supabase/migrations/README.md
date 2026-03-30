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

All migrations use `IF NOT EXISTS` / `IF NOT EXISTS` guards where possible, so re-running an already-applied migration is generally safe (idempotent).

## Adding New Migrations

1. Create a new file with the next sequential number: `00012_description.sql`
2. Use `IF NOT EXISTS` guards where possible for idempotency
3. Add the migration to the table above
4. Test against a development database before applying to production

# Database Documentation & Checklists

## Cross-Tenant Testing Requirements
All databases must pass the following test assertions:
- `site A` cannot read `site B` rows.
- `site A` cannot write `site B` rows.
- Deleted/archived records are unavailable to anonymous users.
- `super_admin` exceptions are explicitly defined and tested.

## RLS Verification Checklist
For every table (`products`, `clicks`, `commissions`, `sites`):
- [ ] RLS is enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY;`)
- [ ] `anon` policies are minimal (e.g. `SELECT` only).
- [ ] `authenticated` policies are tenant-isolated.
- [ ] Service-role usage is avoided in application code (enforced by ESLint).

## Query Indexing
Review execution plans (`EXPLAIN ANALYZE`) for high-traffic queries:
- Product/content listings (Compound indexes on `site_id`, `created_at`)
- Admin search (GIN indexes on text vectors)
- Clicks/event ingestion (Timestamp partitions/indexes)

## Schema Drift Check (CI)
CI runs `npm run db:types` and `git diff --exit-code types/database.ts supabase/schema.sql` to ensure TypeScript types and DB schema remain perfectly in sync.

## Connection Pooling & PITR
- **Connection Pooling:** Use `SUPABASE_DB_POOLER_URL` for direct ORM connections, reserving `NEXT_PUBLIC_SUPABASE_URL` for the Data API.
- **Backups & PITR:** Point-in-Time Recovery is enabled in Supabase production. Daily backups are scheduled automatically.
- **Orphan Checks:** Ensure `ON DELETE CASCADE` is explicitly set for `products -> sites`, `clicks -> products`, etc.

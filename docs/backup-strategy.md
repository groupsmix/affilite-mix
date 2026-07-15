# Data Backup Strategy

This document outlines the backup and disaster recovery strategy for the Affilite-Mix affiliate platform.

## 1. Supabase Built-in Backups

### Free / Pro Plan — Daily Backups

Supabase automatically creates **daily backups** on all paid plans. These are retained for 7 days and can be restored from the Supabase Dashboard under **Settings > Database > Backups**.

### Pro Plan — Point-in-Time Recovery (PITR)

For production environments, enable **Point-in-Time Recovery (PITR)** on the Supabase Pro plan:

1. Go to **Supabase Dashboard > Project Settings > Add-ons**
2. Enable the PITR add-on
3. PITR allows recovery to any point within the retention window (typically 7–30 days)

> **Recommendation:** Enable PITR for any production site handling real affiliate revenue.

## 2. Manual Backup Script

For additional safety, run a scheduled export of critical tables:

```bash
#!/bin/bash
# backup.sh — Export critical tables to timestamped SQL dumps
# Run via cron: 0 2 * * * /path/to/backup.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

# Export critical tables
TABLES="sites categories products content content_products newsletter_subscribers admin_users affiliate_clicks"

for TABLE in $TABLES; do
  pg_dump "$DATABASE_URL" \
    --table="$TABLE" \
    --data-only \
    --format=custom \
    --file="${BACKUP_DIR}/${TABLE}.dump"
done

echo "Backup completed: ${BACKUP_DIR}"
```

### What to back up

| Table                    | Priority | Notes                                |
| ------------------------ | -------- | ------------------------------------ |
| `sites`                  | Critical | Site configuration rows              |
| `categories`             | Critical | All taxonomy categories              |
| `products`               | Critical | Product catalog with affiliate links |
| `content`                | Critical | Articles, reviews, guides            |
| `content_products`       | High     | Content-to-product relationships     |
| `newsletter_subscribers` | High     | Subscriber list                      |
| `admin_users`            | High     | Admin account credentials            |
| `affiliate_clicks`       | Medium   | Analytics data (can be regenerated)  |
| `audit_log`              | Low      | Admin action history                 |

## 3. Recovery Procedures

### Scenario A: Accidental data deletion

1. If PITR is enabled, restore to a point just before the deletion via the Supabase Dashboard
2. Otherwise, restore from the most recent daily backup
3. For table-level recovery, use `pg_restore` with the manual backup dumps. A
   single table with no inbound foreign keys can be restored directly:
   ```bash
   pg_restore --data-only --table=products -d "$DATABASE_URL" backups/YYYYMMDD/products.dump
   ```
   When restoring **multiple** tables, always follow the dependency-ordered,
   transactional procedure in [§3.1](#31-fk-safe-multi-table-restore-f-3) so
   foreign keys are not violated mid-restore.

### Scenario B: Complete database loss

1. Create a new Supabase project
2. Apply all migrations in order (see `supabase/migrations/README.md`)
3. Restore data from the most recent backup using the FK-safe procedure in
   [§3.1](#31-fk-safe-multi-table-restore-f-3) — a whole-database restore is the
   case most exposed to referential-integrity failures
4. Update environment variables to point to the new project
5. Verify RLS policies are applied correctly

### 3.1 FK-safe multi-table restore (F-3)

> **Why this matters:** per-table `pg_dump --data-only` dumps carry no schema
> and no dependency ordering. Restoring them in an arbitrary order violates
> foreign keys — e.g. `content_products` rows arriving before their parent
> `content` / `products` rows, or `products.category_id` before `categories`.
> A restore that fails partway leaves referential gaps precisely during an
> incident.

Two controls make the restore safe and deterministic:

1. **Dependency ordering** — restore parents before children. The canonical
   order is derived from the schema's foreign keys and is machine-checked in
   `scripts/backup-restore-order.ts` (guarded by
   `__tests__/backup-restore-order.test.ts`; self-check via
   `npm run verify:backup-order`):

   ```
   sites, admin_users → categories → products, content → content_products
     → newsletter_subscribers, affiliate_clicks, audit_log
   ```

2. **Transactional, deferred-enforcement restore** — wrap the whole restore in
   one transaction, disable FK/trigger enforcement during the load, and
   re-validate before COMMIT. Any failure rolls the entire restore back instead
   of leaving dangling references:

   ```sql
   -- restore.sql  (run: psql -v ON_ERROR_STOP=1 -f restore.sql)
   BEGIN;
   SET session_replication_role = replica;  -- defer FK/trigger enforcement

   \! pg_restore --data-only --disable-triggers --table=sites            -d "$DATABASE_URL" backups/YYYYMMDD/sites.dump
   \! pg_restore --data-only --disable-triggers --table=admin_users      -d "$DATABASE_URL" backups/YYYYMMDD/admin_users.dump
   \! pg_restore --data-only --disable-triggers --table=categories       -d "$DATABASE_URL" backups/YYYYMMDD/categories.dump
   \! pg_restore --data-only --disable-triggers --table=products         -d "$DATABASE_URL" backups/YYYYMMDD/products.dump
   \! pg_restore --data-only --disable-triggers --table=content          -d "$DATABASE_URL" backups/YYYYMMDD/content.dump
   \! pg_restore --data-only --disable-triggers --table=content_products -d "$DATABASE_URL" backups/YYYYMMDD/content_products.dump
   \! pg_restore --data-only --disable-triggers --table=newsletter_subscribers -d "$DATABASE_URL" backups/YYYYMMDD/newsletter_subscribers.dump
   \! pg_restore --data-only --disable-triggers --table=affiliate_clicks -d "$DATABASE_URL" backups/YYYYMMDD/affiliate_clicks.dump
   \! pg_restore --data-only --disable-triggers --table=audit_log        -d "$DATABASE_URL" backups/YYYYMMDD/audit_log.dump

   SET session_replication_role = origin;    -- re-enable enforcement
   COMMIT;
   ```

   `scripts/backup-restore-order.ts` can emit this ordered wrapper
   programmatically (`buildRestoreSql()`), so the order never drifts from the
   FK graph.

3. **Post-restore FK validation** — after COMMIT, confirm no orphans remain:

   ```sql
   SELECT 'content_products→content' AS check, COUNT(*) AS orphans
     FROM content_products cp LEFT JOIN content c ON c.id = cp.content_id
    WHERE c.id IS NULL
   UNION ALL
   SELECT 'content_products→products', COUNT(*)
     FROM content_products cp LEFT JOIN products p ON p.id = cp.product_id
    WHERE p.id IS NULL
   UNION ALL
   SELECT 'products→categories', COUNT(*)
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.category_id IS NOT NULL AND c.id IS NULL;
   -- All rows must report orphans = 0.
   ```

> **Prefer a full logical dump / PITR** for whole-database recovery whenever
> possible: `pg_dump` (without `--table`) preserves dependency order and
> constraints, and PITR restores a consistent snapshot. The per-table procedure
> above is the fallback when only the manual dumps exist.

### Scenario C: Schema corruption

1. Compare current schema against `supabase/migrations/00001_initial_schema.sql`
2. Identify and fix discrepancies using `ALTER TABLE` statements
3. Re-apply any missing migrations

## 4. Incident Response Runbook

### Step-by-step recovery checklist

When a data incident is detected, follow this checklist:

1. **Assess scope** — Identify which tables/rows are affected and the timeframe
2. **Pause writes** — If corruption is ongoing, enable Supabase maintenance mode or revoke the service role key temporarily
3. **Notify stakeholders** — Alert the team via the designated channel
4. **Choose recovery method**:
   - Single table / few rows → use manual backup dump (`pg_restore`)
   - Multiple tables / unclear scope → use PITR (if enabled) or daily backup
   - Complete loss → follow Scenario B above
5. **Execute recovery** — Restore data using the chosen method
6. **Verify integrity** — Check row counts, foreign key relationships, and RLS policies
7. **Resume operations** — Re-enable writes and verify the application is functional
8. **Post-mortem** — Document root cause, timeline, and prevention measures

### R2 media recovery

Media files stored in Cloudflare R2 are separate from database backups:

- R2 does not have built-in PITR — consider enabling **R2 object versioning** in the Cloudflare Dashboard
- For critical media, set up a daily sync to a secondary bucket:
  ```bash
  # Sync R2 media to a backup bucket (run via cron or CI)
  rclone sync r2:primary-bucket r2:backup-bucket --transfers 10
  ```
- Image URLs are stored in the `products.image_url` column — if R2 data is lost, these URLs will return 404s

### Cloudflare Workers / KV recovery

- **KV data** (rate limiting): Ephemeral by design — no backup needed, regenerates automatically
- **Worker code**: Deployed from Git — redeploy via `npm run deploy` or CI/CD
- **Worker secrets** (CRON_SECRET, etc.): Stored in password manager, re-set via `wrangler secret put`

## 5. Monitoring & Alerting

| Component             | Monitor              | Alert threshold               |
| --------------------- | -------------------- | ----------------------------- |
| Supabase daily backup | Dashboard → Backups  | Missing backup for >24h       |
| Manual backup cron    | Cron job exit code   | Non-zero exit code            |
| Database size         | Supabase Dashboard   | >80% of plan storage          |
| R2 bucket size        | Cloudflare Dashboard | >90% of bucket quota          |
| PITR retention        | Supabase Dashboard   | Verify PITR is enabled weekly |

## 6. Content Export (Future Enhancement)

Consider adding an admin UI feature for content export:

- **JSON export** of all products and content for a site
- **CSV export** for spreadsheet-based review
- **Full site export** including categories, products, content, and settings

This would allow site administrators to create on-demand backups without database access.

## 7. Best Practices

- **Test restores regularly** — a backup is only as good as its restore process
- **Store backups off-site** — use a separate cloud storage bucket (e.g., S3, R2) for backup dumps
- **Monitor backup jobs** — set up alerts for failed backup cron jobs
- **Document credentials separately** — never store database credentials in backup files
- **Rotate backups** — keep 7 daily + 4 weekly + 3 monthly backups
- **Automate verification** — after each restore test, run a health-check query to confirm data integrity
- **Version your schema** — keep all migrations in `supabase/` so you can rebuild from scratch

# Data Backup Strategy

This document outlines the backup and disaster recovery strategy for the NicheHub affiliate platform.

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

| Table | Priority | Notes |
|---|---|---|
| `sites` | Critical | Site configuration rows |
| `categories` | Critical | All taxonomy categories |
| `products` | Critical | Product catalog with affiliate links |
| `content` | Critical | Articles, reviews, guides |
| `content_products` | High | Content-to-product relationships |
| `newsletter_subscribers` | High | Subscriber list |
| `admin_users` | High | Admin account credentials |
| `affiliate_clicks` | Medium | Analytics data (can be regenerated) |
| `audit_log` | Low | Admin action history |

## 3. Recovery Procedures

### Scenario A: Accidental data deletion

1. If PITR is enabled, restore to a point just before the deletion via the Supabase Dashboard
2. Otherwise, restore from the most recent daily backup
3. For table-level recovery, use `pg_restore` with the manual backup dumps:
   ```bash
   pg_restore --data-only --table=products -d "$DATABASE_URL" backups/YYYYMMDD/products.dump
   ```

### Scenario B: Complete database loss

1. Create a new Supabase project
2. Apply all migrations in order (see `supabase/migrations/README.md`)
3. Restore data from the most recent backup
4. Update environment variables to point to the new project
5. Verify RLS policies are applied correctly

### Scenario C: Schema corruption

1. Compare current schema against `supabase/migrations/00001_initial_schema.sql`
2. Identify and fix discrepancies using `ALTER TABLE` statements
3. Re-apply any missing migrations

## 4. Content Export (Future Enhancement)

Consider adding an admin UI feature for content export:

- **JSON export** of all products and content for a site
- **CSV export** for spreadsheet-based review
- **Full site export** including categories, products, content, and settings

This would allow site administrators to create on-demand backups without database access.

## 5. Best Practices

- **Test restores regularly** — a backup is only as good as its restore process
- **Store backups off-site** — use a separate cloud storage bucket (e.g., S3, R2) for backup dumps
- **Monitor backup jobs** — set up alerts for failed backup cron jobs
- **Document credentials separately** — never store database credentials in backup files
- **Rotate backups** — keep 7 daily + 4 weekly + 3 monthly backups

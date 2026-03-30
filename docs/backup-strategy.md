# Data Backup Strategy

## Supabase Built-in Backups

Supabase provides automatic daily backups on the **Pro plan** and above:

- **Daily backups** — retained for 7 days (Pro) or 30 days (Enterprise)
- **Point-in-Time Recovery (PITR)** — available on Pro plan; enables restoring to any point within the retention window

### Enabling PITR

1. Go to **Supabase Dashboard → Project Settings → Database → Backups**
2. Enable **Point-in-Time Recovery**
3. Set desired retention period

## Manual Backup Script

For critical tables, schedule a periodic `pg_dump` via cron or CI:

```bash
#!/bin/bash
# backup.sh — dump critical tables to a timestamped file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TABLES="sites categories products content newsletter_subscribers admin_users audit_log affiliate_clicks"

for TABLE in $TABLES; do
  pg_dump "$DATABASE_URL" \
    --table="$TABLE" \
    --data-only \
    --format=custom \
    --file="backups/${TABLE}_${TIMESTAMP}.dump"
done

echo "Backup complete: $TIMESTAMP"
```

## Recovery Procedures

### From Supabase PITR

1. Go to **Supabase Dashboard → Database → Backups**
2. Select the desired restore point
3. Click **Restore**

### From Manual Backup

```bash
pg_restore --dbname="$DATABASE_URL" --data-only backups/TABLE_TIMESTAMP.dump
```

## Content Export (Future Enhancement)

Consider adding an admin UI feature for on-demand content export:

- Export content as JSON or CSV from `/admin/content`
- Export products as CSV from `/admin/products` (already available via CSV tools)
- Export newsletter subscribers list

## Recommended Schedule

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Supabase automatic | Daily | 7–30 days |
| Manual pg_dump | Weekly | 90 days |
| Content CSV export | Monthly | Indefinite |

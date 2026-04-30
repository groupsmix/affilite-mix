# Runbook: R2 Orphan Object Cleanup

## Context

R2 objects can become orphaned when:

- An upload is initiated (`/api/admin/upload`) but never finalized (`/api/admin/upload/finalize`)
- A finalization fails after the staging object was created
- A site is deleted but its uploaded media remains in R2
- The staging bucket accumulates objects from failed validations that weren't cleaned up

## Identifying Orphans

### Staging Bucket Orphans

Objects in the private staging bucket (`R2_PRIVATE_BUCKET`) that are older than 24 hours are likely orphans -- the finalize step should complete within minutes.

```bash
# List objects in the staging bucket older than 24 hours
wrangler r2 object list <R2_PRIVATE_BUCKET> --prefix="uploads/" | \
  jq '.objects[] | select(.uploaded < (now - 86400) | todate)'
```

### Public Bucket Orphans (Deleted Sites)

Cross-reference R2 objects with the database to find media belonging to deleted sites:

```bash
# Get list of active site IDs
psql "$SUPABASE_DB_URL" -t -A -c "SELECT id FROM sites WHERE is_active = true;"

# Compare with R2 object prefixes (objects are keyed by date, not site_id,
# so you'll need to check the x-amz-meta-site-id metadata)
```

## Cleanup Procedure

### 1. Staging Bucket Cleanup

```bash
# Delete staging objects older than 24 hours
# First, do a dry run to see what would be deleted
wrangler r2 object list <R2_PRIVATE_BUCKET> --prefix="uploads/" | \
  jq -r '.objects[] | select(.uploaded < (now - 86400) | todate) | .key'

# Then delete them
for key in $(wrangler r2 object list <R2_PRIVATE_BUCKET> --prefix="uploads/" | \
  jq -r '.objects[] | select(.uploaded < (now - 86400) | todate) | .key'); do
  echo "Deleting: $key"
  wrangler r2 object delete <R2_PRIVATE_BUCKET> "$key"
done
```

### 2. Public Bucket Cleanup (Site Removal)

Only run this after confirming the site has been fully deactivated and data retention requirements are met:

```bash
# List all objects (paginated)
wrangler r2 object list <R2_PUBLIC_BUCKET> --prefix="uploads/"
```

### 3. Automated Lifecycle Rules (Recommended)

Configure R2 lifecycle rules to auto-expire staging objects:

```bash
# Set a 7-day lifecycle rule on the staging bucket
# (Currently must be done via the Cloudflare Dashboard or API)
```

## Prevention

- The finalize route (`app/api/admin/upload/finalize/route.ts`) already deletes staging objects on validation failure
- Consider adding a nightly cron job to clean up staging orphans older than 24 hours
- Add R2 storage monitoring to the alerting runbook

## Cost Impact

R2 storage is $0.015/GB/month. Even moderate orphan accumulation (< 1 GB) has minimal cost impact, but cleanup is good hygiene and prevents confusion during incident investigation.

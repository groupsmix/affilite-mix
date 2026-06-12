# Migration Squashing Runbook

**Purpose**: Safely execute migration squashing per ADR-0013 to reduce migration count and improve bootstrap times.

**Trigger**: Migration count exceeds 50 files, or quarterly maintenance.

## Prerequisites

- Access to production database (SUPABASE_DB_URL)
- PostgreSQL client tools installed (pg_dump)
- Supabase CLI installed
- Maintenance window or low-traffic period
- Staging environment available for testing

## Pre-Execution Checklist

- [ ] Notify team of upcoming migration squashing
- [ ] Ensure no ongoing deployments or schema changes
- [ ] Backup current production database
- [ ] Verify staging environment is healthy
- [ ] Have rollback plan ready (restore from backup)

## Execution Steps

### 1. Preparation

```bash
# Set database connection
export SUPABASE_DB_URL="your-production-db-url"

# Verify connection
psql $SUPABASE_DB_URL -c "SELECT 1"
```

### 2. Run Squashing Script

```bash
# Execute the squashing script
node scripts/squash-migrations.mjs
```

This will:
- Take a schema-only dump of current database
- Save as `supabase/migrations/00000_baseline.sql`
- Archive existing migrations to `supabase/migrations/_archive/`

### 3. Verification

```bash
# Create a test database from baseline
createdb test_migration_squash
psql test_migration_squash < supabase/migrations/00000_baseline.sql

# Compare schemas
pg_dump $SUPABASE_DB_URL --schema-only --no-owner --no-acl > production_schema.sql
pg_dump test_migration_squash --schema-only --no-owner --no-acl > baseline_schema.sql

# Diff the schemas
diff production_schema.sql baseline_schema.sql
```

### 4. Staging Test

```bash
# Deploy to staging first
git add supabase/migrations/
git commit -m "ADR-0013: Execute migration squashing"

# Test staging deployment
# (Use your normal staging deployment process)

# Verify application functionality in staging
# - Run smoke tests
# - Verify key user flows
# - Check database queries
```

### 5. Production Deployment

```bash
# Deploy to production during maintenance window
# (Use your normal production deployment process)

# Monitor for issues
# - Check error logs
# - Monitor database performance
# - Verify key functionality
```

## Rollback Plan

If issues occur:

1. Restore database from pre-squashing backup
2. Revert code changes:
   ```bash
   git revert HEAD
   ```
3. Re-deploy previous version
4. Archive failed baseline for investigation

## Post-Execution

- [ ] Update ADR-0013 status to "Executed"
- [ ] Document any issues encountered
- [ ] Update monitoring/alerting if needed
- [ ] Schedule next squashing (quarterly or at 50 migrations)

## Monitoring

Watch for:
- Increased error rates in application logs
- Slow database queries
- Failed migrations
- Application startup issues

## Success Criteria

- Baseline migration produces identical schema to individual migrations
- Application functions correctly in staging and production
- Bootstrap time for fresh environments is significantly reduced
- No regression in functionality or performance
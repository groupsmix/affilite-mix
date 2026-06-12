# Migration Squashing Guide (F-06)

## Overview
This guide documents the steps to squash 253+ database migrations into a baseline schema per ADR-0013. This operation requires production database access and should be performed during a maintenance window.

## Prerequisites
- Production Supabase database access
- `pg_dump` access to production database
- Local development environment with Supabase CLI
- Backup of production database (mandatory before proceeding)

## Phase 1: Baseline Snapshot

### 1.1 Take Production Schema Dump
```bash
# Connect to production Supabase
pg_dump -h <prod-host> -U <prod-user> -d <prod-db> --schema-only --no-owner --no-acl > baseline_schema.sql
```

### 1.2 Verify Schema Dump
- Ensure the dump contains all tables, indexes, and constraints
- Verify no data is included (schema-only flag)
- Check that the file is not empty

### 1.3 Create Baseline Migration
```bash
# Create new baseline migration file
supabase migration new baseline_schema
```

### 1.4 Populate Baseline Migration
Copy the contents of `baseline_schema.sql` into the new migration file:
```sql
-- supabase/migrations/00000_baseline_schema.sql
-- This file represents the production schema as of <DATE>
-- All previous migrations are archived in supabase/migrations/archive/

-- [Paste the pg_dump output here]
```

## Phase 2: Archive Old Migrations

### 2.1 Create Archive Directory
```bash
mkdir -p supabase/migrations/archive
```

### 2.2 Move Old Migrations
```bash
# Move all migrations except the new baseline to archive
mv supabase/migrations/0000*.sql supabase/migrations/archive/
mv supabase/migrations/0000*-down.sql supabase/migrations/archive/
```

### 2.3 Verify Archive
- Ensure only `00000_baseline_schema.sql` remains in `supabase/migrations/`
- Verify all old migrations are in `supabase/migrations/archive/`

## Phase 3: Verification

### 3.1 Test in Development
```bash
# Reset local database
supabase db reset

# Verify schema matches production
supabase db diff --schema public
```

### 3.2 Schema Parity Check
- Compare local schema with production schema
- Ensure all tables, columns, indexes, and constraints match
- Verify RLS policies are present

### 3.3 Test Application
- Run development server
- Test critical user flows
- Verify database operations work correctly

## Phase 4: Rollback Plan

If issues are discovered after squashing:

### 4.1 Restore from Archive
```bash
# Move archived migrations back
mv supabase/migrations/archive/*.sql supabase/migrations/

# Remove baseline migration
rm supabase/migrations/00000_baseline_schema.sql

# Reset database
supabase db reset
```

### 4.2 Production Rollback
- Restore from pre-squashing backup
- Verify application functionality
- Document incident and lessons learned

## Post-Squashing Benefits

### Improved Development Experience
- Faster local database resets (fewer migrations to apply)
- Reduced CI/CD bootstrapping time
- Easier onboarding for new developers

### Maintenance
- Future migrations start from a clean baseline
- Easier to understand current schema state
- Reduced migration file count

## Notes

- **Performance Impact**: Minimal - schema-only dump is fast
- **Risk**: Low if backup is taken and verification is thorough
- **Frequency**: Recommended quarterly or when migration count exceeds 100
- **Coordination**: Coordinate with team to avoid conflicts during squashing

## References
- ADR-0013: Migration Squashing Strategy
- Supabase Documentation: https://supabase.com/docs/guides/cli/local-development

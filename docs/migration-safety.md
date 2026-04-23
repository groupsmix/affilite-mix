# Migration Dry-Run & Safety — F-015

## Overview
Guidelines for safe database migrations with rollback support.

## Migration Workflow

### 1. Before Creating Migration
```bash
# Create a backup of staging DB
./scripts/backup-staging.sh

# Verify current schema
pg_dump -h staging-db -U postgres -d affilite_mix --schema-only > schema-before.sql
```

### 2. Write Migration with DOWN
Every migration MUST have one of:
- A companion DOWN migration
- A `-- NO DOWN` marker if forward-only is justified

```sql
-- 00052_feature_add.sql
-- Description: Adds new feature column
-- NO DOWN: Data migration, rollback requires manual SQL

ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_at timestamptz;
```

### 3. Test on Staging
```bash
# Apply migration to staging
psql -h staging-db -U postgres -d affilite_mix -f supabase/migrations/00052_feature_add.sql

# Verify with smoke tests
npm run test:integration

# Check schema diff
pg_dump -h staging-db -U postgres -d affilite_mix --schema-only > schema-after.sql
diff schema-before.sql schema-after.sql
```

### 4. Review in PR
- Migration file reviewed by backend engineer
- DOWN migration or NO DOWN justification included
- Smoke test results attached

## Schema Diff CI (F-015)

Add to CI pipeline:
```yaml
- name: Check schema diff
  run: |
    # Apply migration to shadow DB
    # Compare before/after schema
    # Fail if unexpected changes
```

## Rollback Procedure

```bash
# If migration fails in production:
psql -h prod-db -U postgres -d affilite_mix -f supabase/migrations/00052_feature_add_DOWN.sql

# Verify rollback
npm run test:integration
```

## Checklist
- [ ] Backup staging before migration
- [ ] Write DOWN migration or justify NO DOWN
- [ ] Test on staging with smoke tests
- [ ] Document schema diff in PR
- [ ] Get backend engineer approval

Updated: 2026-04-23
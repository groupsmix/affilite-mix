# F-14: Migration Replay CI Gate

## Status: Script Created - Requires Manual CI Integration

## Purpose

Ensure every database migration has a corresponding down-migration for safe rollback capability. This is critical for production incident response and disaster recovery testing.

## Implementation

### Script Created

`scripts/check-migration-replay.sh` - Validates:

1. Every up-migration has a corresponding down-migration file
2. Down-migrations are not empty or comment-only
3. Migration naming conventions are consistent

### CI Integration Required

Add the following step to `.github/workflows/ci.yml` after line 64 (after the existing migration policy lint):

```yaml
      - name: Migration policy lint (E-2)
        run: bash scripts/check-migrations.sh
      - name: F-14: Migration replay check
        run: bash scripts/check-migration-replay.sh
      - name: Env-var documentation guard (G-13)
```

### Script Behavior

**Checks Performed:**

1. **Missing down-migrations**: For each `*.sql` file, expects a corresponding `*-down.sql` file in `supabase/migrations-down/`
2. **Empty down-migrations**: Warns if down-migration files are empty or contain only comments
3. **Naming convention**: Validates filenames match pattern `TIMESTAMP_description.sql` or `NUMBER_description.sql`

**Exit Codes:**

- `0`: All checks passed
- `1`: One or more violations found
- `2`: Migrations directory not found

**Output:**

- Summary of checked migrations
- List of missing down-migrations
- List of empty down-migrations
- List of naming convention issues
- GitHub Actions annotations for easy error location

## Example Output

```
=== F-14: Checking migration replay capability ===
Scanning directory: supabase/migrations

❌ Missing down-migrations (2):
   - 20260101000000_create_users.sql
   - 20260102000000_add_products.sql

❌ Empty down-migrations (1):
   - 00001_initial_schema-down.sql

⚠️  Naming convention issues (1):
   - custom_migration.sql

::error::F-14: Migration replay check failed with 4 violation(s)
Fix: Add down-migrations or populate empty down-migration files
```

## Testing

### Local Testing

```bash
# Test against default migrations directory
bash scripts/check-migration-replay.sh

# Test against custom directory
bash scripts/check-migration-replay.sh path/to/migrations
```

### CI Testing

After integrating into CI workflow:

1. Create a test migration without a down-migration
2. Push to a feature branch
3. Verify CI fails with appropriate error message
4. Add corresponding down-migration
5. Verify CI passes

## Best Practices for Down-Migrations

### Writing Down-Migrations

Down-migrations should be the exact inverse of their up-migrations:

**Example Up-Migration** (`20240101000000_create_users.sql`):

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Down-Migration** (`20240101000000_create_users-down.sql`):

```sql
DROP TABLE users;
```

### Complex Migrations

For complex migrations with multiple steps, reverse each step in opposite order:

**Up:**

```sql
ALTER TABLE products ADD COLUMN price DECIMAL(10,2);
CREATE INDEX idx_products_price ON products(price);
```

**Down:**

```sql
DROP INDEX idx_products_price;
ALTER TABLE products DROP COLUMN price;
```

### Data Migrations

For data migrations (INSERT/UPDATE), down-migrations should clean up the data:

**Up:**

```sql
INSERT INTO settings (key, value) VALUES ('feature_flag', 'true');
```

**Down:**

```sql
DELETE FROM settings WHERE key = 'feature_flag';
```

## Exemptions

Some migrations may intentionally lack down-migrations. To exempt these:

1. Update the script to skip specific migrations by adding to a whitelist
2. Document why the migration is irreversible in the migration file comment
3. Update this runbook with the exemption rationale

## Related Documentation

- `docs/runbooks/migration-rollback.md` - Migration rollback procedures
- `scripts/check-migrations.sh` - Existing migration policy lint
- `docs/adr/0013-migration-squashing.md` - Migration squashing strategy

## Monitoring

After CI integration, monitor:

- Frequency of missing down-migrations (should decrease to zero)
- Developer feedback on check friction
- Time added to CI pipeline

## Success Criteria

- [ ] Script integrated into CI workflow
- [ ] All existing migrations pass the check or have documented exemptions
- [ ] New migrations consistently include down-migrations
- [ ] Migration rollback procedures tested and documented
- [ ] Production rollback capability verified during DR drills

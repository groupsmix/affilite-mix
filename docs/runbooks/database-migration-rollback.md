# Runbook: Database Migration Rollback

## When to Use

- A migration was applied to production and is causing errors
- A migration introduced a schema change that broke the application
- A data migration corrupted or deleted records

## Prerequisites

- `psql` CLI installed
- Access to `SUPABASE_DB_URL` or `SUPABASE_DB_POOLER_URL`
- The corresponding `-down.sql` file for the migration to roll back

## Procedure

### 1. Identify the Broken Migration

```bash
# Check the latest migration applied
psql "$SUPABASE_DB_URL" -c "SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;"
```

### 2. Review the Rollback Script

Every migration in `supabase/migrations/` has a corresponding `-down.sql` file in the sibling `supabase/migrations-down/` directory. Review it before applying:

```bash
cat supabase/migrations-down/00094_fts_index_alignment-down.sql
```

Verify the rollback script:

- Does it use `IF EXISTS` guards?
- Does it handle data that may have been created since the migration?
- Are there CASCADE implications?

### 3. Apply the Rollback

```bash
# Apply the down migration
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations-down/NNNNN_name-down.sql
```

### 4. Remove the Migration Record

```bash
psql "$SUPABASE_DB_URL" -c "DELETE FROM supabase_migrations.schema_migrations WHERE version = 'NNNNN_name';"
```

### 5. Verify the Rollback

```bash
# Check that the migration is no longer listed
psql "$SUPABASE_DB_URL" -c "SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;"

# Verify the schema change was reverted
psql "$SUPABASE_DB_URL" -c "\d+ affected_table_name"
```

### 6. Deploy the Application Without the Migration

If the application code depends on the rolled-back schema change, you must also roll back the application:

```bash
# Use the Cloudflare rollback workflow
gh workflow run rollback.yml
```

## Post-Rollback

1. Create an incident report per `docs/templates/postmortem.md`
2. Fix the migration and re-test on staging before re-applying
3. Notify the team in the incidents channel

## Caution

- Never roll back migrations that have been live for more than 24 hours without a data impact assessment
- Always take a PITR snapshot before rollback: Supabase Dashboard > Project Settings > Database > Backups
- If the migration involved data transformation, the down script may not perfectly restore original data

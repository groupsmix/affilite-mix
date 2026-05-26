# Migration Squashing Strategy

> **R-008**: 208 migration files with no squashing strategy.

## Problem

Fresh environments replay all 208 migrations sequentially. As migration count
grows, CI staging reset and new developer onboarding become slower.

## Current State

| Metric                         | Value                                            |
| ------------------------------ | ------------------------------------------------ |
| Migration files                | 208                                              |
| Total SQL LOC                  | ~7,989                                           |
| Fresh replay time (local)      | ~45 s                                            |
| Fresh replay time (CI staging) | ~2 min                                           |
| Squash script                  | `scripts/squash-migrations.mjs` (exists, unused) |

## Strategy

### Quarterly Squash Cycle

Every quarter (or when migration count exceeds 250):

1. **Freeze**: No new migrations for 48 hours.
2. **Snapshot**: Dump the production schema to `supabase/baseline.sql`.
3. **Squash**: Replace all migrations older than 90 days with the baseline.
4. **Verify**: Replay the squashed set on a clean database and diff against
   production schema — they must be identical.
5. **Tag**: Git-tag the pre-squash state for audit trail.

### Procedure

```bash
# 1. Dump production schema
pg_dump --schema-only --no-owner --no-privileges \
  "$PRODUCTION_DATABASE_URL" > supabase/baseline.sql

# 2. Identify the squash boundary (keep last ~20 migrations)
BOUNDARY=$(ls supabase/migrations/*.sql | sort | tail -20 | head -1)
echo "Squashing everything before: $BOUNDARY"

# 3. Remove old migrations
ls supabase/migrations/*.sql | sort | while read f; do
  if [[ "$f" < "$BOUNDARY" ]]; then
    git rm "$f"
  fi
done

# 4. Create the baseline migration (timestamp before the boundary)
mv supabase/baseline.sql supabase/migrations/00000000000000_baseline.sql

# 5. Verify
node scripts/squash-migrations.mjs --verify

# 6. Tag the pre-squash commit
git tag "pre-squash-$(date +%Y%m%d)" HEAD~1
```

### Safety Rules

- Never squash migrations that haven't been applied to production.
- Always keep the `_migrations_applied` ledger table in the baseline.
- The baseline must be idempotent (use `IF NOT EXISTS` for all DDL).
- Run the squashed migration set against a clean Supabase project before
  merging.
- Keep the pre-squash git tag for at least 1 year.

### Rolling Window

After squashing, the migration directory should contain:

```
supabase/migrations/
├── 00000000000000_baseline.sql      ← everything before the boundary
├── 20260501120000_recent_change_1.sql
├── 20260510090000_recent_change_2.sql
├── ...
└── 20260525150000_latest.sql
```

## Metrics

| Metric            | Before | Target |
| ----------------- | ------ | ------ |
| Migration files   | 208    | ~25    |
| Fresh replay time | ~2 min | ~15 s  |
| CI staging reset  | ~3 min | ~30 s  |

## References

- `scripts/squash-migrations.mjs` — existing squash utility
- `docs/migration-safety.md` — migration development guidelines
- `docs/migration-rollback.md` — production rollback procedures

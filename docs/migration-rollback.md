# Migration Rollback Runbook — Production

**Last updated**: 2026-05-26
**Audience**: On-call engineers, backend team

---

## Prerequisites

- Direct access to Supabase production project (Dashboard or `psql`)
- `_migrations_applied` ledger table is present (migration 00001)
- Staging environment available for rehearsal

---

## Decision Tree

```
Migration failed in production?
  ├── YES: Has a companion -down.sql?
  │     ├── YES → Execute the down migration (§1)
  │     └── NO  → Manual rollback (§2)
  └── NO (migration succeeded but caused regressions)
        ├── Data-only (INSERT/UPDATE/DELETE)?
        │     └── Restore from point-in-time backup (§3)
        └── Schema change (ALTER/CREATE/DROP)?
              ├── Additive only (new column/table)?
              │     └── Safe to leave; fix forward (§4)
              └── Destructive (DROP COLUMN, rename)?
                    └── Restore from point-in-time backup (§3)
```

---

## §1 — Execute Down Migration

```bash
# 1. Identify the failed migration number
SELECT * FROM _migrations_applied ORDER BY applied_at DESC LIMIT 5;

# 2. Locate the down file
ls supabase/migrations-down/NNNNN_*-down.sql

# 3. Run the down migration inside a transaction
psql "$DATABASE_URL" <<'SQL'
BEGIN;
\i supabase/migrations-down/NNNNN_description-down.sql
DELETE FROM _migrations_applied WHERE migration_name = 'NNNNN_description';
COMMIT;
SQL

# 4. Verify schema is back to expected state
psql "$DATABASE_URL" -c "\d+ affected_table"

# 5. Run integration tests against the reverted schema
npm run test:integration
```

---

## §2 — Manual Rollback (No Down Migration)

When the migration is marked `-- NO DOWN`:

1. **Check the migration file** for a `-- ROLLBACK NOTES:` comment
2. **Write the inverse SQL** based on the forward migration
3. **Test on staging first** before touching production
4. **Execute inside a transaction** (see §1 step 3)
5. **Update `_migrations_applied`** to remove the entry

If the migration is not transaction-safe (e.g., `CREATE INDEX CONCURRENTLY`),
execute each statement individually and verify between steps.

---

## §3 — Point-in-Time Recovery (PITR)

Supabase Pro plans include PITR. Use when:

- Data corruption occurred
- A destructive migration cannot be reversed cleanly

```
1. Open Supabase Dashboard → Database → Backups
2. Select "Point-in-time recovery"
3. Choose a timestamp BEFORE the migration was applied
4. Restore to a NEW project (never overwrite production directly)
5. Verify the restored data
6. Swap connection strings or replicate corrected data back
```

**Warning**: PITR restores the entire database. Any writes after the
restore point are lost. Coordinate with the team before proceeding.

---

## §4 — Fix Forward

For additive-only migrations (new columns, new tables, new indexes) that
cause application-level regressions:

1. **Deploy a code fix** that handles the new schema gracefully
2. **Do not drop** the new column/table — other migrations may depend on it
3. If the column is truly unwanted, create a new forward migration to drop it

---

## §5 — Migration Hygiene Rules

| Rule                                                            | Enforcement                  |
| --------------------------------------------------------------- | ---------------------------- |
| Every migration has a `-down.sql` or `-- NO DOWN` justification | PR review checklist          |
| Destructive migrations require a staging rehearsal              | CI `migration-safety` check  |
| `IF EXISTS` / `IF NOT EXISTS` on all DDL for idempotency        | PR review                    |
| Large data migrations use batched updates with `LIMIT`          | Performance review           |
| `_migrations_applied` ledger updated by every migration         | Convention (migration 00001) |

---

## §6 — Emergency Contacts

| Role               | Escalation                          |
| ------------------ | ----------------------------------- |
| Database on-call   | Check PagerDuty / Opsgenie rotation |
| Supabase support   | support@supabase.io (Pro plan)      |
| Cloudflare support | dash.cloudflare.com → Support       |

---

## See Also

- `docs/migration-safety.md` — Migration creation workflow and CI checks
- `docs/DR-RUNBOOK.md` — Full disaster recovery procedures
- `supabase/migrations/` — All migration files (208+)

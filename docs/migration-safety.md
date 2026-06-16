# Migration Safety Guide

Guidance for writing and rolling back Supabase migrations.

## CONCURRENTLY Operations

Several migrations use `CREATE INDEX CONCURRENTLY` or `DROP INDEX CONCURRENTLY`.
These statements **cannot run inside a transaction** — PostgreSQL raises an error
if you try.

### Affected migrations

| Migration                                 | Operation                   | Notes                              |
| ----------------------------------------- | --------------------------- | ---------------------------------- |
| `00094_fts_index_alignment.sql`           | `CREATE INDEX CONCURRENTLY` | Full-text search indexes           |
| `2026052302_security_audit_hardening.sql` | `CREATE INDEX CONCURRENTLY` | Security hardening indexes         |
| `2026052303_split_concurrent_indexes.sql` | `CREATE INDEX CONCURRENTLY` | Products/admin-users/sites indexes |

### Rules

1. **Mark files with `-- supabase:no-transaction`** at the top so the Supabase
   CLI runs them outside an implicit transaction.
2. **Rollback files** (`*-down.sql`) for concurrent ops must also use
   `DROP INDEX CONCURRENTLY` with the same `-- supabase:no-transaction` marker.
3. **Never mix** `CONCURRENTLY` operations with other DDL in the same file.
   Split them into separate migrations.
4. **Manual rollback** during an incident: if the migration runner wraps
   everything in a transaction, the rollback will fail. Apply the `DROP INDEX`
   statements manually via `psql`.

## Forward-Only Migrations

Some migrations are intentionally irreversible:

| Migration                       | Reason                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| `00098_enforce_timestamptz.sql` | Converting `TIMESTAMPTZ` back to `TIMESTAMP` loses timezone data |

Their `-down.sql` files exist (for CI enforcement) but contain only a comment
explaining why rollback is unsafe.

## Down-Migration Requirements

Every up-migration **must** have a corresponding `-down.sql` file in the sibling
`supabase/migrations-down/` directory. The CI script
`scripts/check-migrations.sh` enforces this. Down-migrations are exempt from the
RLS and security-definer checks since they intentionally restore prior state.

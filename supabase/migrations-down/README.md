# `supabase/migrations-down/` — rollback (down) migrations

Every forward migration in [`../migrations/`](../migrations/) that performs a
data-destructive or policy-changing operation ships a paired rollback file
here, named `<version>_<name>-down.sql` (the same basename as the
up-migration, with a `-down` suffix).

## Why aren't these next to the up-migrations?

The Supabase CLI — and the Supabase **branching / "Supabase Preview"**
integration — globs `supabase/migrations/*.sql` and derives each migration's
`schema_migrations` **version** from the leading filename prefix. If a down
file lived beside its up-migration, `NNNNN_x.sql` and `NNNNN_x-down.sql` would
both resolve to version `NNNNN` and collide on insert:

```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(00000) already exists.
```

Keeping the down files in this **sibling directory** — which Supabase does not
scan as migrations — avoids the collision while preserving a deterministic
up → down mapping. (CI already worked around this for its own psql replay by
skipping `*-down.sql`; the branching integration can't be told to skip them,
hence the relocation.)

## How the tooling finds them

For an up-migration `supabase/migrations/<base>.sql`, the rollback file is
`supabase/migrations-down/<base>-down.sql`. This mapping is used by:

- `scripts/check-migrations.sh` — CI gate: every up-migration must have a down
- `scripts/check-migration-replay.sh` — down completeness / non-empty checks
- `.github/workflows/deploy.yml` — automated post-deploy rollback
- `__tests__/migration-order.test.ts`

## Authoring & running a rollback

1. Add `supabase/migrations-down/<version>_<name>-down.sql` whenever you add an
   up-migration that changes RLS, policies, or otherwise needs reverting. Use a
   single `-- NO DOWN: <reason>` line only when the change is purely additive
   and idempotent.
2. To roll back the most recently applied migration:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/migrations-down/<version>_<name>-down.sql
   ```

See [`../migrations/README.md`](../migrations/README.md) and
`docs/runbooks/database-migration-rollback.md` for the full playbook.

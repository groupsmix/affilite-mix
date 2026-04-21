# Supabase — Source of Truth & Workflow

This project uses Supabase (Postgres + RLS) as its primary data store.
Production project ref: `odgtwjkzwciohhhqdtti`.

## Source of truth

```
supabase/migrations/*.sql          ← authoritative (applied in order)
        │
        ▼
supabase/schema.sql                ← human-readable reference snapshot
types/supabase.ts                  ← Database<> type consumed by createClient<Database>()
```

- **Migrations** are the only authoritative source. Every schema change
  lands as a new forward migration file with a sequential numeric prefix
  (`00040_*.sql`, `00041_*.sql`, …).
- **`supabase/schema.sql`** is a commented, hand-curated reference of
  the live shape. Update it alongside any migration that adds/removes
  columns, tables, indexes, or policies. It is NOT the schema you apply;
  it is documentation.
- **`types/supabase.ts`** is the `Database` type used by the typed
  Supabase client in `lib/supabase.ts` / `lib/supabase-server.ts`. It is
  regenerated from the linked project via
  `supabase gen types typescript --linked`. Any manual additions must be
  re-applied after regeneration.
- **`types/database.ts`** is the hand-curated app-level row types
  (`ProductRow`, `ContentRow`, `NewsletterSubscriberRow`, …). It is
  **not** regenerated.

## Linking a project

```bash
# Required env:
#   SUPABASE_ACCESS_TOKEN  → Personal Access Token
#   SUPABASE_DB_PASSWORD   → remote DB password

export SUPABASE_ACCESS_TOKEN=sbp_...
supabase link --project-ref odgtwjkzwciohhhqdtti -p "$SUPABASE_DB_PASSWORD"
supabase migration list -p "$SUPABASE_DB_PASSWORD"
```

The final command shows local-vs-remote migration versions and should
exit with all rows matched. If a version is missing on one side, fix it
via Task "Safe migration workflow" below — never by rewriting applied
migration files.

## Safe migration workflow

1. **Create** a new forward migration at the next sequential prefix:
   `supabase/migrations/000NN_short_name.sql`.
2. **Make it idempotent** — use `IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
   `CREATE OR REPLACE`, etc.
3. **Test locally** against a scratch DB:
   ```bash
   supabase db reset            # scratch DB only — NEVER run against prod
   ```
4. **Apply** to the linked project:
   ```bash
   supabase db push
   ```
5. **Regenerate artifacts** (see below) and commit the diff alongside
   the migration in the same PR.

### Never do

- Do not edit or re-number a migration file that is already applied on
  any environment (prod, staging, a branch DB). Add a new forward
  migration instead.
- Do not run `supabase db reset` against the linked project — it is
  destructive.
- Do not hand-edit `types/supabase.ts` or `supabase/schema.sql` for
  schema content; comments and docblocks are the only safe hand-edits.

### Repair drift (advanced)

If local and remote migration history diverge (mismatched names at the
same prefix), resolve on the **remote ledger** rather than rewriting
history:

```bash
# Mark a specific version as already-applied / not-applied on remote:
supabase migration repair --status applied  <version>
supabase migration repair --status reverted <version>
```

The repo is currently aligned so that every local
`supabase/migrations/000NN_*.sql` file name matches the corresponding
`supabase_migrations.schema_migrations` row on prod (verified
`2026-04-21`).

## Regenerating schema.sql and types/supabase.ts

```bash
# Requires: supabase CLI linked + Docker available locally (the CLI uses
# a pinned postgres image to run pg_dump against the remote).
bash scripts/check-schema-drift.sh
```

The drift script dumps the live schema into `supabase/schema.sql` and
regenerates `types/supabase.ts`, then exits non-zero if the committed
files differ. Commit the regenerated output alongside the migration
that caused the change.

If Docker Hub / public ECR is rate-limiting image pulls, run the CLI
against a locally-installed `pg_dump 17`:

```bash
export PATH=/usr/lib/postgresql/17/bin:$PATH
supabase db dump --db-url "postgresql://postgres.<ref>:$(python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.environ[\"SUPABASE_DB_PASSWORD\"],safe=\"\"))')@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
  > supabase/schema.sql
supabase gen types typescript --linked > types/supabase.ts
```

## Public RLS posture

See [`docs/public-rls-inventory.md`](./public-rls-inventory.md) for the
current policy inventory. Summary: no `anon` SELECT or INSERT policies
exist on any public-schema table. All application data is served via
server-side DAL helpers using the service-role client.

## Known manual steps (dashboard / secrets)

The following cannot be expressed as migrations and are the owner's
responsibility:

- **Rotate keys / secrets** if they leak. `SUPABASE_SERVICE_ROLE_KEY`
  and `SUPABASE_DB_PASSWORD` live in the Supabase dashboard (Project
  Settings → API / Database).
- **Enable/adjust Auth providers** (email, OAuth) in the dashboard —
  not managed here.
- **Storage buckets, SMTP, Edge Functions deploy**: configure in the
  dashboard as needed.
- **Branching / preview databases** are not currently wired up; add
  when Supabase branching is enabled on this project.

## Known remaining risks

- `types/supabase.ts` is missing type definitions for `ai_drafts` and
  `affiliate_networks` (introduced by migration 00029). Both tables are
  service-role-only and not consumed via the typed client today, so the
  gap is benign — but regeneration should be run the next time Docker
  access is available to close the gap.
- The drift script (`scripts/check-schema-drift.sh`) is not wired into
  CI (it requires CLI auth + DB password). It is a manual pre-release
  check.
- Multiple Supabase projects exist under the same access token
  (`nichhub`, `staging nichhub`, `odgtwjkzwciohhhqdtti`). Always confirm
  the project ref before running any `db push` / `migration repair`.

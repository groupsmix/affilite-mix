# Local Supabase stack for integration tests

Audit reference: **J-1 (Finding F20)**.

## Why

`__tests__/integration/**` exercises real Supabase queries (RLS, cascades,
atomic upserts). Unit tests alone can't cover those behaviours, so we
ship a disposable `docker-compose` stack that brings up just enough
Supabase surface — Postgres + PostgREST + Kong — for `supabase-js` to
talk to over `http://localhost:54321`.

## Prerequisites

- Docker 20+
- `docker compose` plugin (Compose V2 syntax)

## Start / stop

```bash
# Boot the stack (first run pulls images + applies all migrations).
docker compose up -d

# Tail logs while bringing it up.
docker compose logs -f db rest kong

# Stop the stack and discard the volume so the next run reapplies
# migrations from scratch.
docker compose down -v
```

## Run integration tests against the local stack

```bash
docker compose up -d
source scripts/integration-env.sh
npm run test:integration
```

`scripts/integration-env.sh` sets `TEST_WITH_SUPABASE=1` along with the
standard Supabase self-hosted dev JWTs, which are the only JWTs that
decode against the `JWT_SECRET` baked into `docker-compose.yml`. These
keys are **not secrets** — they're the publicly documented Supabase
demo credentials and only work against the local stack.

The `describe.skipIf(!shouldRunSupabaseIntegration)` gate in
`__tests__/integration/helpers/should-run.ts` keeps the suite inert
unless both `TEST_WITH_SUPABASE=1` and a non-placeholder
`NEXT_PUBLIC_SUPABASE_URL` are present, so running `npm test` without
sourcing the env file simply skips the integration suite.

## Run against staging instead

The nightly `integration-nightly.yml` workflow runs the same suite
against the staging Supabase project. To run it manually against
staging from your laptop, export the `STAGING_SUPABASE_*` values
normally stored as GitHub Actions secrets and set
`TEST_WITH_SUPABASE=1` before invoking `npm run test:integration`.

## Resetting the local DB

```bash
docker compose down -v   # drops the supabase-db-data volume
docker compose up -d     # rebuilds and re-applies migrations
```

Since migrations are mounted read-only from `supabase/migrations/`,
adding a new migration file only requires `docker compose down -v` +
`docker compose up -d` to land in the local DB.

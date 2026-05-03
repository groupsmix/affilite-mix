# Audit A22-A31 Decision Log

This document records the decisions, mitigations, and accepted risks for audit
findings A22 through A31. Each section references the finding ID from the
security audit and explains what was done (or why it was explicitly accepted).

---

## A22 -- Backup / Restore

### A22-01 (INFO): Backup SOP location

The canonical backup SOP is [`docs/BACKUP-POLICY.md`](./BACKUP-POLICY.md).
Recovery procedures live in [`docs/DR-RUNBOOK.md`](./DR-RUNBOOK.md).
Secrets rotation is covered by
[`docs/secrets-rotation-runbook.md`](./secrets-rotation-runbook.md).

### A22-02 (MEDIUM): Restore-drill cadence

Quarterly restore drills are documented in
[`docs/dr-drill-checklist.md`](./dr-drill-checklist.md) with a schedule table.
Evidence of each drill (including screenshots with URL bar and system clock)
must be captured per the procedure in
[`docs/BACKUP-POLICY.md` section 5](./BACKUP-POLICY.md#5-evidence-for-auditors).
The drill log in section 6 records completion dates.

### A22-03 (MEDIUM): R2 off-site replication

R2 lifecycle and replication stubs are declared in
[`terraform/cloudflare/storage.tf`](../terraform/cloudflare/storage.tf)
(see OF-11 block). The Cloudflare Terraform provider does not yet support
R2 lifecycle or replication natively. Until it does:

- **Lifecycle rules** are applied via `wrangler r2 bucket lifecycle set` or the
  Cloudflare dashboard.
- **Cross-region replication** is configured under Storage > R2 > Replication
  in the dashboard. The `r2_replication_enabled` variable in `storage.tf`
  documents intent and should be set to `true` in production `tfvars` once
  the feature reaches GA.
- A secondary backup destination (off-Cloudflare) is provided by the nightly
  `pg_dump` workflow that stores logical dumps in the R2 `backup-bucket`
  with 30-day rolling retention and 12 monthly archives.

### A22-04 (MEDIUM): GDPR erasure cascade to R2

The GDPR erasure endpoint at
[`app/api/admin/privacy/user/route.ts`](../app/api/admin/privacy/user/route.ts)
now cascades deletions to R2 objects stored under per-user prefixes
(`uploads/{site_id}/wrist-shots/{email_hash}/` and
`uploads/{site_id}/user-content/{email_hash}/`). R2 cleanup is best-effort;
failures are logged and reported to Sentry but do not block the database
erasure transaction.

### A22-05 (LOW): PITR retention

Supabase Pro plan provides 7-day PITR retention. This is documented in
[`docs/BACKUP-POLICY.md` section 2.2](./BACKUP-POLICY.md#22-point-in-time-recovery-pitr).
The 7-day window is sufficient for the current SLA (5-minute RPO). If
contractual SLAs require 30-day retention, upgrade to the Supabase Team plan
and update the policy.

---

## A23 -- Over-fetching

### A23-01 / A23-02 (MEDIUM): select("*") in DAL and API routes

The DAL functions in `lib/dal/*.ts` use `select("*")` as a convenience for
internal server-side queries. These run behind RLS and the service-role
gateway (`lib/server-only/service-role.ts`), so no columns leak to the
client unless the calling API route explicitly serializes them.

The GDPR export endpoint (`app/api/admin/privacy/user/route.ts`) previously
used `select("*")` and has been updated to use explicit column lists to
avoid exposing internal metadata in the DSAR export payload.

**Accepted risk:** Internal DAL functions retain `select("*")` because:
1. Column lists in 70+ DAL call sites create significant maintenance burden
   and drift risk when schema evolves.
2. RLS + service-role gateway already prevents cross-tenant leakage.
3. API route handlers are the serialization boundary; they choose which
   fields to include in the response.

### A23-03 (LOW): Missing .limit() on list endpoints

DAL list functions that feed paginated UI endpoints should use
`.range(offset, offset + pageSize)` or `.limit(pageSize)`. The `max_rows`
setting in `supabase/config.toml` is set to 1000, providing a server-side
backstop. Callers that need unbounded iteration must use cursor-based
pagination.

---

## A24 -- Connection pool

### A24-01 (LOW): sslmode on SUPABASE_DB_URL

Production `SUPABASE_DB_URL` must use `sslmode=verify-full` to prevent MITM
during `pg_dump` backups. This is enforced by the nightly backup CI job
which appends `?sslmode=verify-full` if not already present. Documented in
[`docs/supabase-connection-pooling.md`](./supabase-connection-pooling.md).

---

## A25 -- Stored procs / triggers / views

### A25-04 (LOW): public_clinic_directory VIEW

Not applicable to this repository (no `public_clinic_directory` view exists).

### A25-05 (LOW): Trigger recursion

No recursive triggers exist in the current migration set. If triggers are
added, they must include `pg_trigger_depth() = 0` guards per the migration
safety checklist in [`docs/migration-safety.md`](./migration-safety.md).

---

## A26 -- Normalization tradeoffs

### A26-01 through A26-04 (LOW): JSONB denormalization

Not directly applicable (this repo does not have `clinics.config`,
`prescriptions.content`, `treatment_plans.steps`, or `suppliers.products`).
The equivalent pattern in this repo is `sites.config JSONB` which stores
per-tenant settings. This is intentionally denormalized per the comments in
`lib/tenant.ts` -- each mutation replaces the whole object, so no
insert/update anomalies arise.

---

## A27 -- Soft-delete

### A27-01 (MEDIUM): deleted_at filtering

This repository does not use soft-delete. No `deleted_at` column exists on
any table. Records are hard-deleted. This is acceptable because:

1. The platform does not require tombstone records for business logic.
2. GDPR erasure (Art. 17) is satisfied by hard deletion.
3. Audit trail is maintained separately in the `audit_log` table.

If soft-delete is introduced in the future, all SELECT queries and RLS
policies must include `WHERE deleted_at IS NULL`, and a partial index
`CREATE INDEX ... WHERE deleted_at IS NULL` should be added.

### A27-02 (LOW): Missing deleted_at on users/appointments

Not applicable (no `users` or `appointments` table with soft-delete
requirements).

### A27-03 (LOW): Partial indexes for deleted_at

Not applicable until soft-delete is introduced. When it is, add:
```sql
CREATE INDEX idx_<table>_active ON <table> (id) WHERE deleted_at IS NULL;
```

---

## A28 -- Time / timezone

### A28-03 (LOW): Year-2038

All timestamps are stored as `TIMESTAMPTZ` (Postgres 8-byte microseconds).
JS `Date` uses 53-bit milliseconds. Both are Y2038-safe.

### A28-04 (LOW): DST boundaries

Tenant timezone is stored as an IANA timezone string in site config. IANA
handles DST transitions correctly, including Morocco's Ramadan-related
switches. No manual DST math is performed in application code.

### A28-05 (LOW): Leap seconds

Postgres and JS both ignore leap seconds (POSIX semantics). No code assumes
leap-second precision.

---

## A29 -- Numeric precision

### A29-02 (LOW): App-side rounding

`Math.round((sum / count) * 10) / 10` is used only for UI display averages,
never persisted as monetary values. Monetary calculations use Postgres
`NUMERIC` types.

### A29-03 (LOW): DECIMAL(10,2) range

Supports up to 99,999,999.99 -- sufficient for the current billing scale.

### A29-04 (LOW): Banker's rounding

JS `Math.round` uses round-half-away-from-zero. For financial aggregates
that require banker's rounding, use `Intl.NumberFormat` with
`roundingMode: "halfEven"` or compute in Postgres using `ROUND()` on
`NUMERIC` values. Current usage is display-only, so the bias is negligible.

---

## A30 -- Replication / sharding

### A30-01 (INFO): Single createClient()

All queries route through the primary via a single `createClient()`. No
read-after-write hazards exist.

### A30-02 (LOW): Read-replica staleness

If read replicas are enabled in the future, webhook handlers that write
then immediately read must pin to the primary connection. The current
codebase uses only the primary, so no action is needed.

### A30-03 (LOW): Hot-shard risk

The system is single-tenant-cluster with RLS. The logical shard key is
`site_id`. Hot-shard risk from a single large site is acceptable at current
scale.

### A30-05 (LOW): Resharding / re-tenancing plan

Not documented. If a single site outgrows the shared cluster, the runbook
for moving it to a dedicated Supabase project should be created under
`docs/runbooks/tenant-migration.md`.

---

## A31 -- IaC line-by-line

### A31.2 / A31.5 / A31.7 (CRITICAL): Ports bound to 0.0.0.0

**Fixed.** All ports in `docker-compose.yml` are now bound to `127.0.0.1`.

### A31.3 (HIGH): Hard-coded POSTGRES_PASSWORD

The `postgres` password in `docker-compose.yml` is intentionally the
standard Supabase self-hosted dev credential. It is used only for local
integration tests and must never be used in staging or production. The
comment block at the top of the file makes this explicit.

### A31.8 (CRITICAL): MinIO default credentials

Not applicable -- this repo does not use MinIO. Object storage is
Cloudflare R2 in production and is not emulated locally.

### A31.9 (HIGH): No network isolation / security hardening

**Fixed.** `docker-compose.yml` now includes:
- `cap_drop: ALL` with minimal `cap_add` per service
- `security_opt: no-new-privileges:true`
- `mem_limit` and `pids_limit` per service
- Isolated `supabase-internal` network with `internal: true`

### A31.11 (MEDIUM): Missing healthchecks

**Fixed.** All three services now have healthchecks. `kong` and `rest` use
`depends_on.condition: service_healthy`.

### A31.12 (CRITICAL): Studio unauthenticated

Not applicable -- this repo does not include Supabase Studio in the compose
stack.

### A31.13 (LOW): Missing labels

**Fixed.** All services now carry `com.affilite-mix.environment` and
`com.affilite-mix.owner` labels.

### A31.14 / A31.15 (MEDIUM/HIGH): Wrangler bindings not in IaC

`wrangler.jsonc` contains all KV, R2, DO, and Queue bindings. Terraform
resources in `terraform/cloudflare/storage.tf` and `queues.tf` own the
infrastructure. The split is documented in
[`terraform/cloudflare/README.md`](../terraform/cloudflare/README.md).

### A31.16 (HIGH): No CPU limit on Workers

CPU limits are configured via the Cloudflare dashboard (unbound plan).
Adding `[limits] cpu_ms = 30000` to `wrangler.jsonc` is planned but
requires testing to avoid false positives on heavy cron jobs.

### A31.17 (HIGH): Observability disabled in IaC

`wrangler.jsonc` sets `observability.enabled = true` (line ~270+). The Tail
Worker log shipper is deployed separately via
`workers/log-shipper/wrangler.jsonc`.

### A31.18 (CRITICAL): Cron triggers not in IaC

Cron triggers are declared in `wrangler.jsonc` under `triggers.crons` and
kept in sync via `lib/cron-registry.ts`. The `cron-registry.test.ts` test
verifies that `wrangler.jsonc` schedules match the registry. See
[ADR-0007](./adr/0007-separate-heavy-crons-worker.md).

### A31.21 (CRITICAL): supabase/config.toml missing

`supabase/config.toml` is present in this repo and version-controlled. It
includes auth settings, pooler config, and network restriction documentation.
Production-only settings (PITR, MFA enforcement, email rate limits) are
configured via the Supabase dashboard because they require plan-level
features not available in the local CLI.

### A31.22 (HIGH): No auditable IaC for production data plane

Terraform resources in `terraform/cloudflare/` cover DNS, WAF, TLS, alerts,
R2, KV, and Queues. Supabase-side controls (RLS, network restrictions,
PITR) are documented in `docs/supabase.md` and enforced by migration
scripts. The gap is Supabase dashboard-only settings (PITR toggle, network
restrictions) which cannot be managed by Terraform.

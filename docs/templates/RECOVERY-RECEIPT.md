# Recovery Drill Receipt

> Fill in this template after each DR drill execution. Store the completed
> receipt as `docs/dr/RECOVERY-RECEIPT-YYYY-MM-DD.md` and link it from
> `docs/dr-drill-checklist.md`.

## Drill Metadata

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| **Date**            | YYYY-MM-DD                         |
| **Conductor**       | (name / GitHub handle)             |
| **Environment**     | staging / ephemeral / production   |
| **Trigger**         | scheduled / post-incident / ad-hoc |
| **Workflow run URL** | (link to GitHub Actions run)      |

## Scope

- [ ] Full restore from pg_dump
- [ ] Migration-only (empty DB + all migrations)
- [ ] Point-in-time recovery (PITR)
- [ ] R2 object restore
- [ ] Secrets rotation post-restore

## Timing

| Phase                        | Start (UTC)        | End (UTC)          | Duration |
| ---------------------------- | ------------------ | ------------------ | -------- |
| Snapshot/dump acquisition     |                    |                    |          |
| Restore to target DB          |                    |                    |          |
| Migration apply (if needed)   |                    |                    |          |
| Smoke test (health endpoint)  |                    |                    |          |
| Application-level validation  |                    |                    |          |
| **Total RTO achieved**        |                    |                    |          |

## Target RTO / RPO vs Actual

| Metric   | Target (from DR-RUNBOOK.md) | Actual    | Pass? |
| -------- | --------------------------- | --------- | ----- |
| **RTO**  |                             |           |       |
| **RPO**  |                             |           |       |

## Verification Steps

- [ ] `GET /api/health` returns `{"status":"healthy"}`
- [ ] Core tables exist (`sites`, `content`, `admin_users`, `audit_log`)
- [ ] Row counts within expected range (compare to pre-drill snapshot)
- [ ] RLS policies active (check `pg_policies` count)
- [ ] Sample admin login succeeds
- [ ] Sample public page renders

## Issues Encountered

| # | Description | Severity | Resolution | Follow-up ticket |
|---|-------------|----------|------------|------------------|
| 1 |             |          |            |                  |

## Lessons Learned

1. (what went well)
2. (what to improve)

## Sign-off

| Role              | Name | Date       |
| ----------------- | ---- | ---------- |
| Drill conductor   |      |            |
| Engineering lead  |      |            |
| On-call engineer  |      |            |

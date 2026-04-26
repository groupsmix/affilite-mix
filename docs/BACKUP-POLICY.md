# Backup Policy

Audit reference: production-readiness checklist item **#47 — Verify Supabase PITR / backups**.

This document is the canonical record of:

- the backup schedule we operate to,
- whether PITR is enabled and what its retention is,
- when restore drills last ran and who owns them,
- the platform's RTO and RPO targets,
- the evidence required to demonstrate the above to an auditor.

The schedule and the evidence list are checked into the repo so that the policy itself is versioned. The dashboard-side state that backs them up — Supabase backup history, the most recent drill timestamp — has to be re-captured periodically; see § 5 for how.

---

## 1. RTO and RPO targets

| Target | Value      | Scope                                 |
| ------ | ---------- | ------------------------------------- |
| RPO    | 5 minutes  | Production database (PITR enabled)    |
| RPO    | 24 hours   | Off-site logical dumps in R2          |
| RTO    | 4 hours    | Full platform restoration end-to-end  |
| RTO    | 60 seconds | Worker rollback (Cloudflare versions) |

The 5-minute RPO is the PITR write-ahead-log granularity. The 4-hour RTO is the upper bound for a worst-case "Supabase project is gone" scenario as described in [`docs/DR-RUNBOOK.md`](./DR-RUNBOOK.md); a database-only restore from PITR is expected to complete within 30 minutes.

---

## 2. Database backups (Supabase)

### 2.1 Automated daily snapshots

- Frequency: daily, taken by Supabase
- Retention: 7 days (rolling)
- Restore path: Supabase Dashboard → Project Settings → Database → Backups → "Restore"
- Plan requirement: Pro plan or above

### 2.2 Point-in-Time Recovery (PITR)

- Frequency: continuous (write-ahead log)
- Retention: 7 days (rolling)
- Granularity: 5-minute RPO
- Restore path: Supabase Dashboard → Project Settings → Add-ons → Point-in-Time Recovery → "Restore"
- Plan requirement: Pro plan **with PITR add-on enabled**
- Required for: production database (`odgtwjkzwciohhhqdtti` per [`docs/supabase.md`](./supabase.md))

### 2.3 Off-site logical dumps

- Frequency: nightly, GitHub Actions cron (`pg_dump` against the Session pooler URL)
- Storage: Cloudflare R2 bucket `backup-bucket`
- Retention: 30 days rolling, 12 monthly archives
- Encryption: at-rest (R2 bucket-level)
- Why: protects against the case where the Supabase project itself is unrecoverable (lost auth, billing lapse, region failure)

The dump procedure is described in [`docs/backup-strategy.md`](./backup-strategy.md#2-manual-backup-script).

---

## 3. Object storage backups (Cloudflare R2)

- **Versioning** enabled on the primary `images` bucket → protects against accidental deletion within the bucket.
- **Cross-bucket sync** to `backup-assets` weekly via a Cloudflare Workers cron job.
- **Retention** on the backup bucket: indefinite for the latest revision per object.

R2 does not have native PITR. The versioning + cross-bucket strategy is documented in [`docs/backup-strategy.md`](./backup-strategy.md#r2-media-recovery).

---

## 4. Code, config, and infrastructure

- All application code lives in this Git repo; restore is `git clone`.
- All Cloudflare resources are managed via Terraform (`terraform/` directory) and re-deployable via `terraform apply`.
- All Worker secrets are documented (names only) in [`docs/CLOUDFLARE.md`](./CLOUDFLARE.md). Values live in GitHub Actions secrets and Cloudflare Workers secrets; rotation procedures are in [`docs/secrets-rotation-runbook.md`](./secrets-rotation-runbook.md).

A "rebuild from zero" walkthrough is in [`docs/cloudflare-recovery.md`](./cloudflare-recovery.md).

---

## 5. Evidence for auditors

This section lists the artefacts required to demonstrate the policy is being followed. Capture them on the cadence in **Frequency** and check them into the evidence folder named in **Storage**. The evidence folder is intentionally outside this repo (it contains screenshots of dashboards and dated `pg_dump` artefacts) — the canonical path is in the team's password manager under `Affilite-Mix → Compliance → backup-evidence/`.

| Item                                  | Source                                                              | Frequency                | Storage path                               |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| Supabase daily-backup list screenshot | Dashboard → Settings → Database → Backups                           | Quarterly                | `backup-evidence/supabase/<YYYY-QN>/`      |
| PITR status screenshot                | Dashboard → Project Settings → Add-ons → Point-in-Time Recovery     | Quarterly                | Same                                       |
| Latest `pg_dump` checksum + size      | GitHub Actions logs of nightly dump job, or `aws s3 ls --recursive` | Monthly                  | `backup-evidence/r2/<YYYY-MM>.txt`         |
| R2 versioning enabled screenshot      | Cloudflare Dashboard → R2 → bucket → Settings                       | On enable, then annually | `backup-evidence/r2/versioning-<YYYY>.png` |
| Restore-drill log                     | This file, § 6                                                      | Quarterly                | This repo (`docs/BACKUP-POLICY.md`)        |
| RTO/RPO sign-off                      | This file, § 1                                                      | Annually                 | This repo                                  |
| Owner roster                          | This file, § 7                                                      | On role change           | This repo                                  |

> **Compliance note:** the evidence folder is the artefact a SOC 2 / ISO 27001 auditor will ask for. Screenshots must include the URL bar (so the project ref is visible) and a system clock or visible timestamp.

---

## 6. Restore-drill log

The full drill protocol — preconditions, queries to run, success criteria — is in [`docs/dr-drill-checklist.md`](./dr-drill-checklist.md). This section records when each drill was last performed and who ran it, as evidence that it actually happens.

> **Update protocol:** when a drill completes, replace the `_TBD_` row for that drill type with a new row giving the date, owner, environment, restore time, outcome, and a link to the post-mortem document (a Notion page, a GitHub issue, or a PR description). Old rows stay in the table — this is the audit trail.

| Drill                           | Last run | Owner | Environment              | Restore time | Outcome | Notes / post-mortem |
| ------------------------------- | -------- | ----- | ------------------------ | ------------ | ------- | ------------------- |
| Database restore (PITR)         | _TBD_    | _TBD_ | Staging Supabase project | _TBD_        | _TBD_   | _TBD_               |
| Database restore (logical dump) | _TBD_    | _TBD_ | Staging Supabase project | _TBD_        | _TBD_   | _TBD_               |
| Worker rollback                 | _TBD_    | _TBD_ | Production               | _TBD_        | _TBD_   | _TBD_               |
| Secrets rotation (one secret)   | _TBD_    | _TBD_ | Production               | _TBD_        | _TBD_   | _TBD_               |
| Full failover (new Supabase)    | _TBD_    | _TBD_ | Staging                  | _TBD_        | _TBD_   | _TBD_               |
| Cron-failure recovery           | _TBD_    | _TBD_ | Production               | _TBD_        | _TBD_   | _TBD_               |

A drill is considered overdue if its last run is older than the cadence in [`docs/dr-drill-checklist.md`](./dr-drill-checklist.md#drill-schedule). Overdue drills MUST be flagged in the next weekly ops review.

---

## 7. Owners

The named owner is responsible for ensuring the drill in their row runs on schedule and for capturing the evidence in § 5. Ownership is a role, not a person — when somebody leaves the role, the row is updated in the same PR that changes the on-call rota.

| Area                           | Owner role                         | Notes                                                            |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| Supabase backups & PITR add-on | Platform on-call (DBA-of-the-week) | Verifies PITR is enabled monthly; pays the Supabase bill         |
| Off-site `pg_dump` cron job    | Platform on-call                   | Owns the GitHub Actions workflow + the R2 bucket lifecycle rules |
| R2 media versioning + sync     | Platform on-call                   | Owns the cross-bucket sync Worker + monitoring                   |
| Restore drill (DB)             | Platform on-call                   | Runs quarterly drill from `docs/dr-drill-checklist.md`           |
| Restore drill (Workers)        | Platform on-call                   | Runs monthly Worker rollback drill                               |
| Secrets rotation               | Security on-call                   | Owns `docs/secrets-rotation-runbook.md`                          |
| Compliance evidence pack       | Security on-call                   | Curates the `backup-evidence/` folder and answers auditors       |

The current names behind these roles live in the password manager (`Affilite-Mix → Ops → on-call.md`) — they are intentionally not in this repo so a personnel change does not require a code review.

---

## 8. Change log

This section is a deliberately small, append-only diary of changes to the policy itself. Changes to the underlying Supabase / Cloudflare configuration (e.g. enabling PITR, raising retention) are recorded here in addition to the migration / Terraform / wrangler change that effected them.

| Date       | Change                                                                                         | Author / PR |
| ---------- | ---------------------------------------------------------------------------------------------- | ----------- |
| 2026-04-26 | Restructured policy: added explicit RTO/RPO table, evidence list, owner roster, and drill log. | This PR     |
| (earlier)  | Initial policy created with PITR + 7-day retention + R2 cross-bucket sync.                     | unrecorded  |

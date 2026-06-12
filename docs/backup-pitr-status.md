# Backup Retention & PITR Status

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Document backup retention, PITR settings, and restore drill status for due diligence

## Backup Sources

| Store                 | Data Type                                                                                                                                              | Backup Method                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Supabase Postgres** | All persistent business objects (sites, admin_users, content, products, comments, wrist_shots, click events, newsletter subscribers, stripe customers) | Daily automatic + PITR                                   |
| **Cloudflare R2**     | Uploaded images and binary attachments (wrist-shot images, page hero images, OG-card assets)                                                           | Versioning + lifecycle rules                             |
| **Stripe**            | Customer / subscription data                                                                                                                           | Source of truth at Stripe; mirrored in `stripe_*` tables |

**Note:** Cloudflare KV is a cache (rate-limit counters, HIBP prefix cache, sitemap last-good) and is not in scope for backup retention.

---

## Supabase Backup Configuration

| Setting                | Value               | Source                                 |
| ---------------------- | ------------------- | -------------------------------------- |
| **Daily Snapshots**    | Enabled             | Supabase Dashboard                     |
| **Snapshot Frequency** | Daily               | Supabase Dashboard                     |
| **Snapshot Retention** | 30 days             | `docs/runbooks/db-backup-retention.md` |
| **PITR Window**        | 7 days              | `docs/runbooks/db-backup-retention.md` |
| **Region Replication** | Managed by Supabase | Supabase Dashboard                     |

**Blind Spot:** Exact PITR retention period (e.g., 7 days, 14 days, 30 days) is not documented in codebase - must verify in Supabase Dashboard.

---

## R2 Backup Configuration

| Setting              | Value                                | Source                                 |
| -------------------- | ------------------------------------ | -------------------------------------- |
| **Versioning**       | Enabled                              | Cloudflare Dashboard                   |
| **Lifecycle Rule**   | Keep 30 days of overwritten versions | `docs/runbooks/db-backup-retention.md` |
| **Retention Window** | 30 days                              | `docs/runbooks/db-backup-retention.md` |
| **Cross-Region**     | Multi-region by default              | R2 is multi-region by default          |

---

## Recovery Objectives (RPO/RTO)

| Class of Incident                       | Target RPO                        | Target RTO                                             |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Single-tenant accidental delete         | <24h (last daily) or <5min (PITR) | <30min                                                 |
| Schema-level corruption                 | <24h                              | <2h                                                    |
| Total Supabase loss (region down)       | <24h                              | <8h (re-point to new project, restore latest snapshot) |
| R2 bucket overwrite / accidental delete | <30d (versioning)                 | <1h per affected object                                |

---

## Restore Drill Status

**Required Cadence:** At least once per quarter

**Last Successful Drill:** **TBD pre-launch** - No drills have been performed yet

| Date           | Drilled By | Snapshot Age | Restore Time | Pass/Fail | Notes                                                       |
| -------------- | ---------- | ------------ | ------------ | --------- | ----------------------------------------------------------- |
| TBD pre-launch | SRE lead   | 12h          | TBD          | TBD       | Initial baseline; document deviations from target RTO above |

**Status:** ⚠️ **No drills performed yet** - This is a pre-launch gap that must be addressed before production launch.

---

## Restore Procedures

### Supabase Restore

1. In Supabase Dashboard: **Database → Backups → Point-in-time recovery** or **Daily Snapshots**
2. Confirm target timestamp with incident commander
3. **Restore to a NEW project** (not the live one) - production stays up while validating
4. Once validated, either:
   - **Swap connection strings**: Update Supabase project ID in `wrangler.jsonc` `[env.production.vars]` (or equivalent secret), redeploy
   - **Backfill**: Run targeted `pg_dump` of restored project for affected rows/tables, import into live project

### R2 Restore

1. In Cloudflare Dashboard: **R2 → bucket → Object Versioning**
2. For each affected key, choose version to restore (or use bulk-restore API for many objects)
3. Verify by hitting public URL of one restored object

---

## Validation After Restore

- [ ] `SELECT count(*) FROM admin_users;` matches pre-incident count
- [ ] `SELECT count(*) FROM sites;` matches pre-incident count
- [ ] At least one admin can log in
- [ ] At least one public route returns 200 for a tenant-scoped read
- [ ] CRON jobs fired since restore can complete (`scheduled` handler runs without error in `wrangler tail`)

---

## Blind Spots (Information Not Available in Codebase)

The following backup/PITR configuration details are not documented in the codebase and must be obtained from the Supabase Dashboard:

- **Exact PITR retention period** (7 days, 14 days, 30 days, etc.)
- **Supabase plan/tier** (determines backup features available)
- **Replica configuration** (read replicas enabled/disabled)
- **WAL archiving configuration** (if configured separately from PITR)
- **Backup storage location** (AWS region for backup storage)
- **Automated backup schedule time** (when daily snapshots are taken)
- **Physical backup size** (storage consumed by backups)

---

## Required Actions

1. **Verify PITR settings** in Supabase Dashboard → Project Settings → Database → Backups
2. **Document exact retention periods** for daily snapshots and PITR window
3. **Perform first restore drill** before production launch (as documented in drill checklist)
4. **Update drill log** after each quarterly drill
5. **Document backup storage costs** and retention compliance with data residency requirements

---

## References

- `docs/runbooks/db-backup-retention.md` - Complete backup retention and recovery runbook
- `docs/backup-strategy.md` - Database backup and restore procedures
- `docs/data-residency.md` - Data residency and GDPR compliance
- `docs/DR-RUNBOOK.md` - Disaster recovery runbook
- `docs/runbooks/database-migration-rollback.md` - Migration rollback procedures

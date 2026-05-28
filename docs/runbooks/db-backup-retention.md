# Database Backup Retention & Recovery Runbook

> audit5-#37: documents the backup retention policy, RPO/RTO targets, and
> the recovery drill cadence required to keep them honest.

## Backup sources

`affilite-mix` data lives in two stores:

1. **Supabase Postgres** — every persistent business object (sites,
   admin_users, content, products, comments, wrist_shots, click events,
   newsletter subscribers, stripe customers, etc.).
2. **Cloudflare R2** — uploaded images and arbitrary binary attachments
   (wrist-shot images, page hero images, OG-card assets, etc.).

Cloudflare KV is a **cache** — it carries rate-limit counters, HIBP
prefix cache, sitemap last-good. KV loss is a degradation, not a data
loss, and is not in scope for this runbook.

## Retention policy

| Store                               | Snapshot frequency                                                       | Retention window                                    | Cross-region copy                   |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------- |
| Supabase Postgres (paid plan)       | Daily automatic + PITR (last 7 days)                                     | 30 days for daily snapshots, 7 days for PITR window | Supabase manages region replication |
| R2 buckets                          | Versioning enabled, lifecycle rule: keep 30 days of overwritten versions | 30 days                                             | R2 is multi-region by default       |
| Stripe customer / subscription data | Source of truth lives at Stripe; we keep mirror in `stripe_*` tables     | Mirrors are reproducible from Stripe webhooks       | n/a                                 |

## Recovery Objectives

| Class of incident                       | Target RPO                        | Target RTO                                             |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Single-tenant accidental delete         | <24h (last daily) or <5min (PITR) | <30min                                                 |
| Schema-level corruption                 | <24h                              | <2h                                                    |
| Total Supabase loss (region down)       | <24h                              | <8h (re-point to new project, restore latest snapshot) |
| R2 bucket overwrite / accidental delete | <30d (versioning)                 | <1h per affected object                                |

## Quarterly Recovery Drill

Required at least **once per quarter**. The drill is a "real" restore to
a separate Supabase project + R2 bucket; do not drill against
production.

### Drill checklist

1. Pick a target snapshot age (e.g., "restore from 12h ago").
2. Provision a sandbox Supabase project + R2 bucket.
3. Restore the chosen snapshot.
4. Run `npm run test:integration` against the restored DB.
5. Run a manual smoke: log in as an admin, publish a content row, fetch
   it via the public API. Confirm RLS scopes correctly.
6. Tear down the sandbox.
7. Update the "Last drill" row below.

### Drill log

| Date             | Drilled by | Snapshot age | Restore time | Pass/Fail | Notes                                                         |
| ---------------- | ---------- | ------------ | ------------ | --------- | ------------------------------------------------------------- |
| _TBD pre-launch_ | _SRE lead_ | _12h_        | _TBD_        | _TBD_     | _Initial baseline; document deviations from target RTO above_ |

If a quarter passes with no drill, the on-call engineer **must** raise
a blocker — undrilled backups are presumed broken until proven
otherwise.

## Restore procedure (Supabase)

1. In the Supabase dashboard for the affected project: **Database →
   Backups → Point-in-time recovery** or **Daily Snapshots**.
2. Confirm the target timestamp with the incident commander.
3. **Restore to a NEW project**, not the live one. Production stays up
   while you validate.
4. Once validated, either:
   - **Swap connection strings**: update the Supabase project ID in
     `wrangler.jsonc` `[env.production.vars]` (or the equivalent
     secret), redeploy.
   - **Backfill**: run a targeted `pg_dump` of the restored project for
     just the affected rows / tables, import into the live project.

## Restore procedure (R2)

1. In Cloudflare dashboard: **R2 → bucket → Object Versioning**.
2. For each affected key, choose the version to restore (or use the
   bulk-restore API if many objects).
3. Verify by hitting a public URL of one restored object.

## Validation after restore

- [ ] `SELECT count(*) FROM admin_users;` matches pre-incident count.
- [ ] `SELECT count(*) FROM sites;` matches pre-incident count.
- [ ] At least one admin can log in.
- [ ] At least one public route returns 200 for a tenant-scoped read.
- [ ] CRON jobs fired since restore can complete (`scheduled` handler
      runs without error in `wrangler tail`).

## Out of scope for this runbook

- Disaster recovery for Cloudflare itself (DNS, Workers, R2) — see
  `cloudflare-zone-incident.md`.
- Rolling back a bad migration — see `database-migration-rollback.md`.

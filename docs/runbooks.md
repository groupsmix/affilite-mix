# Affilite-Mix Runbooks & DR Documentation

> A40: Operational runbooks, SLO definitions, and disaster-recovery procedures.

## SLO Definitions

| Service                   | SLO Target      | Error Budget | Burn-Rate Alert         |
| ------------------------- | --------------- | ------------ | ----------------------- |
| Worker HTTP 5xx rate      | < 5% over 5 min | 0.1% / month | `worker_5xx_alert`      |
| Worker CPU time           | < 50 ms p99     | 100 ms p99   | `worker_cpu_time_alert` |
| Queue consumer lag        | < 60 seconds    | 5 min        | `queue_backlog_alert`   |
| Click-tracking durability | 99.9%           | 0.1%         | DLQ depth monitor       |

## Alert Response

### worker_5xx_alert fires

1. Check Cloudflare Workers dashboard → Observability for error spikes.
2. If correlated with a deploy, consider rollback via `rollback.yml`.
3. Check Supabase status page for DB outages.
4. If KV/DO failure, verify rate limiting is fail-closed (F-006).

### worker_cpu_time_alert fires

1. Check Workers dashboard → CPU time metrics.
2. If heavy crons are running, verify they are executing on
   `affilite-mix-heavy-crons` worker (not the main worker).
3. Check for infinite loops or N+1 queries in recent deploys.

### queue_backlog_alert fires

1. Check queue depth: `npx wrangler queues info click-tracking`
2. If depth > 1000, verify consumer (custom-worker.ts queue handler)
   is healthy and not throwing errors.
3. Check DLQ: `npx wrangler queues info click-tracking-dlq`
4. If consumer is failing, check Supabase connectivity and
   retry logic in `/api/queue/clicks`.

## Disaster Recovery

### RTO / RPO Targets

| Scenario                  | RTO                                | RPO           |
| ------------------------- | ---------------------------------- | ------------- |
| Worker failure (code bug) | 10 min (rollback)                  | 0 (stateless) |
| KV namespace loss         | 30 min (restore from backup)       | 1 hour        |
| R2 bucket loss            | 1 hour (cross-region replica)      | 15 min        |
| Supabase outage           | 2 hours (failover to read replica) | 5 min         |
| Complete account loss     | 4 hours (Terraform rebuild)        | 1 hour        |

### DR Procedures

#### Worker Rollback

```bash
# Roll back to the last known good version
gh workflow run rollback.yml -f version=<git-sha>
```

#### KV Namespace Restore

```bash
# List available snapshots
scripts/cf-security-snapshot.sh --list-backups

# NOTE: `wrangler kv:namespace restore` is NOT a supported Wrangler command.
# KV does not support bulk restore natively. To restore from a backup snapshot
# (JSON file produced by cf-security-snapshot.sh or a manual export), use
# the Cloudflare KV bulk write API:
#
#   BACKUP_FILE=<path-to-backup.json>
#   NAMESPACE_ID=<id>
#   CF_ACCOUNT_ID=<account-id>
#
#   # Restore all keys from the backup via the KV bulk write endpoint:
#   curl -s -X PUT \
#     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/storage/kv/namespaces/$NAMESPACE_ID/bulk" \
#     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
#     -H "Content-Type: application/json" \
#     -d "@$BACKUP_FILE"
#
# The backup file must be a JSON array of { key, value, expiration?, metadata? }
# objects as produced by the KV list + read export script.
```

#### R2 Bucket Recovery

```bash
# If cross-region replication is enabled, promote the replica:
# (Requires R2 replication GA — documented for future use)
# curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/r2/buckets/$BUCKET/replication/promote"
```

#### Supabase Failover

1. Activate read replica in Supabase dashboard.
2. Update `SUPABASE_URL` Worker secret via `wrangler secret put`.
3. Run health check: `curl https://<domain>/api/health`

### DR Drill Log

| Date                   | Scenario | RTO Achieved | Notes |
| ---------------------- | -------- | ------------ | ----- |
| (Schedule first drill) |          |              |       |

## Cron Job Runbook

### Schedule (all UTC)

| Cron          | Frequency   | Handler                     | Max Runtime |
| ------------- | ----------- | --------------------------- | ----------- |
| `*/5 * * * *` | Every 5 min | `/api/cron/publish`         | 2 min       |
| `0 1 * * *`   | Daily 1 AM  | `/api/cron/stripe-sync`     | 10 min      |
| `0 3 * * *`   | Daily 3 AM  | `/api/cron/sitemap-refresh` | 5 min       |
| `0 4 * * *`   | Daily 4 AM  | `/api/cron/data-retention`  | 30 min      |
| `0 6 * * *`   | Daily 6 AM  | `/api/cron/epc-recompute`   | 15 min      |
| `0 * * * *`   | Hourly      | `/api/cron/expire-deals`    | 2 min       |

### Daylight Saving

All cron schedules are in UTC and do not observe daylight saving time.
No schedule adjustments are needed.

### Failed Run Recovery

1. Check Workers Observability for cron invocation errors.
2. If a job failed mid-run, check the KV lock key:
   `cf_lock/<job-name>/<YYYY-MM-DD-HH>` — delete if stuck.
3. For data-retention jobs, verify no partial deletions occurred.
4. Re-run manually via the Cloudflare Dashboard or by temporarily
   adding a one-off cron trigger.

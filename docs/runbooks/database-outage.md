# Runbook: Database (Supabase) Outage

> **Severity**: P1 — Critical
> **Response time**: < 15 minutes
> **Escalation**: Slack `#incidents` + phone page

## Symptoms

- API routes returning 500/503 errors
- Admin panel showing "Failed to load" errors
- Sentry spike in `PostgrestError` or connection timeout exceptions
- `/api/health` reports `database: down`

## Diagnosis

### Step 1: Confirm the outage

```bash
# Check health endpoint
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://wristnerd.site/api/health | jq .database

# Check Supabase status page
open https://status.supabase.com
```

### Step 2: Determine scope

| Check            | Command                                                                           | What It Means         |
| ---------------- | --------------------------------------------------------------------------------- | --------------------- |
| Can you connect? | `psql "$DATABASE_URL" -c "SELECT 1"`                                              | Basic connectivity    |
| Connection count | `psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity"`                 | Connection exhaustion |
| Active queries   | `psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_activity WHERE state = 'active'"` | Long-running queries  |
| Disk usage       | Check Supabase Dashboard → Database → Disk                                        | Disk full             |

### Step 3: Identify the cause

| Symptom              | Likely Cause                     | Action                         |
| -------------------- | -------------------------------- | ------------------------------ |
| Connection refused   | Supabase outage                  | Wait + check status page       |
| Too many connections | Connection exhaustion            | Kill idle connections          |
| Slow queries         | Missing index or lock contention | Identify and kill long queries |
| Disk full            | Data growth exceeded plan        | Upgrade plan or purge old data |

## Mitigation

### Connection Exhaustion

```sql
-- Kill idle connections older than 5 minutes
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < now() - interval '5 minutes'
  AND pid != pg_backend_pid();
```

### Long-Running Query

```sql
-- Find and kill queries running > 60 seconds
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - pg_stat_activity.query_start > interval '60 seconds';

-- Kill a specific query
SELECT pg_cancel_backend(<pid>);
```

### Supabase Platform Outage

1. Check https://status.supabase.com
2. If confirmed, the application will degrade gracefully:
   - Public pages serve cached content
   - Click tracking queues events for later processing
   - Admin operations return 503
3. Monitor Supabase status for resolution
4. After resolution, verify data integrity

## Recovery

1. Confirm database is accessible: `SELECT 1`
2. Check `/api/health` returns all green
3. Review Sentry for any lingering errors
4. Check click queue for backed-up events
5. Verify admin operations work end-to-end

## Prevention

- Monitor connection count (alert at 80% of limit)
- Set statement timeout: `SET statement_timeout = '30s'`
- Review slow query log weekly
- See `docs/supabase-connection-pooling.md` for pooling configuration

## References

- `docs/DR-RUNBOOK.md` — disaster recovery procedures
- `docs/supabase-connection-pooling.md` — connection pooling
- `docs/migration-rollback.md` — migration rollback procedures

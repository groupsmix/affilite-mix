# Runbook: Supabase Connection Pool Exhaustion

## Symptoms

- API routes returning 503 errors with "connection refused" or "too many connections"
- Health endpoint (`/api/health`) reporting database check as "error"
- Sentry alerts with `PGRST` or `connection pool` error messages
- Slow response times across all routes

## Diagnosis

### 1. Check Current Connection Count

```bash
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM pg_stat_activity;"
psql "$SUPABASE_DB_URL" -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
```

### 2. Identify Long-Running Queries

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
  ORDER BY duration DESC;
"
```

### 3. Check for Lock Contention

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT blocked_locks.pid AS blocked_pid,
         blocking_locks.pid AS blocking_pid,
         blocked_activity.query AS blocked_query,
         blocking_activity.query AS blocking_query
  FROM pg_catalog.pg_locks blocked_locks
  JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.relation = blocked_locks.relation
    AND blocking_locks.pid != blocked_locks.pid
  JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid;
"
```

## Immediate Mitigation

### 1. Kill Long-Running Queries

```bash
# Kill a specific query by PID
psql "$SUPABASE_DB_URL" -c "SELECT pg_terminate_backend(<PID>);"

# Kill all idle connections older than 5 minutes
psql "$SUPABASE_DB_URL" -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND query_start < now() - interval '5 minutes'
    AND pid != pg_backend_pid();
"
```

### 2. Enable Maintenance Mode (if severe)

Set `APP_MAINTENANCE_MODE=1` in Cloudflare KV or as a Worker secret to shed load while investigating:

```bash
# Via KV (hot toggle, no redeploy)
wrangler kv:key put --namespace-id=<APP_CACHE_KV_ID> maintenance_mode "1"
```

### 3. Scale Connection Pool (if available)

- Supabase Dashboard > Project Settings > Database > Connection Pooling
- Increase the pool size if on a paid plan
- Consider enabling Supavisor session mode

## Root Cause Investigation

1. Check if a cron job (AI generation, price scraping) is holding connections
2. Check if a bulk admin operation (CSV import, bulk publish) is running
3. Check if connection pooling is configured (Supavisor should be the default on Supabase Pro+)
4. Review `lib/fetch-timeout.ts` to ensure all DB operations have timeouts

## Prevention

- Ensure all DAL functions use `fetchWithTimeout` or have query timeouts
- Monitor connection count via the health endpoint
- Set up Sentry alerts on connection pool errors
- Consider read replicas for public read-heavy workloads

# 3AM Runbook: Cache Down & DB Saturation

## 1. Scope
This runbook covers two specific critical scenarios:
1. **Partial or Total Cache Outage** (Redis/KV goes down).
2. **Supabase DB Saturation** (Connection pool exhaustion or 100% CPU).

## 2. Scenario A: Cache Outage (KV / Redis)

### Symptoms
- 5xx errors on rate-limited endpoints.
- High latency on page loads due to cache misses.
- Sentry alerts for `checkRateLimit` or `KV namespace` connection timeouts.

### Immediate Mitigation (Fail-Open)
The system is designed to fail-open for caching (except for security endpoints). 
If the outage is affecting security endpoints (e.g., login), and legitimate users are locked out:
1. Assume the `break_glass` role (see `break-glass-procedure.md`).
2. Temporarily adjust `failPolicy: "closed"` to `failPolicy: "open"` in `app/api/auth/*/route.ts` if deemed safe by the Incident Commander.
3. **Deploy the emergency mitigation**: `npm run deploy`

### Resolution
- Check the Cloudflare Status page for KV outages.
- If it's a transient network issue, wait for recovery.
- Revert any `failPolicy` changes immediately after the cache is restored.

## 3. Scenario B: Supabase DB Saturation

### Symptoms
- Pgbouncer/Supabase connection limits reached (`FATAL: sorry, too many clients already`).
- `lib/click-queue.ts` DLQ (Dead Letter Queue) alerts firing heavily in Sentry.
- Database CPU at 100%.

### Immediate Mitigation
1. **Shed Load (Drop Non-Critical Writes)**
   The `click-queue` handles click tracking. Under extreme load, we want to drop clicks rather than kill the database. The system already catches queue failures and logs to Sentry rather than falling back to sync writes.
   *Action:* Verify `click-queue` DLQ isn't overflowing. If it is, mute Sentry alerts to prevent Sentry quota exhaustion.
2. **Scale Connection Pool**
   - Log into the Supabase Dashboard.
   - Go to Database -> Connection Pooling.
   - Temporarily increase the pool size if the underlying Postgres instance has available memory/CPU.
3. **Scale Compute**
   - If CPU is 100%, upgrade the Supabase compute size immediately. This requires a few minutes of downtime, but is better than a continuous brownout.

### Resolution
- Analyze `pg_stat_statements` to find the offending queries.
- Add caching or missing indexes to mitigate the root cause.
- Scale down the compute size during the next off-peak window.

# DLQ Overflow Runbook

**Alert**: `click_tracking_dlq_depth` (Terraform: `terraform/cloudflare/alerts.tf`)

## Symptoms

- DLQ depth exceeds configured threshold
- Click-tracking messages failing after `max_retries` (3) exhausted
- Possible Supabase saturation or downstream DB connectivity issues

## Severity

**P2** during normal traffic; **P1** during high-traffic events (Black Friday, launches).

## Investigation

1. **Check Supabase health**:
   - Dashboard → Project → Database → Connection Pool utilization
   - If pool is saturated, scale connections or throttle ingestion

2. **Check queue metrics** (Cloudflare Dashboard → Workers → Queues):
   - `click-tracking` backlog depth
   - `click-tracking-dlq` message count
   - Consumer error rate

3. **Check Worker logs** (`wrangler tail`):
   - Look for repeated errors in the `queue` handler
   - Identify poison messages (malformed payloads, missing fields)

## Mitigation

1. **If Supabase is overloaded**: Reduce `max_batch_size` in `wrangler.jsonc`
   (default: 25) to lower DB pressure per batch.

2. **If poison messages**: Inspect DLQ messages via Cloudflare API, identify
   the malformed payload pattern, and purge affected messages.

3. **Replay after fix**:
   ```bash
   # Replay DLQ messages back to the main queue
   # See: https://developers.cloudflare.com/queues/reference/apis/
   ```

## Prevention

- Monitor `click_tracking_dlq_depth` alert threshold vs expected burst volume
- During high-traffic events, pre-scale Supabase connection pool
- Review `max_retries` (currently 3) — increasing may help transient failures
  but delays poison-message detection

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

## On-call Routing (audit5-#28)

The `click_tracking_dlq_depth` alarm currently delivers via email only. To
guarantee a human responds inside the SLA (P2 → 4h, P1 → 1h), the
delivery target must be a real on-call rotation, not a shared inbox.

### Required configuration

1. Create a PagerDuty / Opsgenie service named `affilite-mix-dlq` with
   one escalation policy:
   - Level 1: primary on-call rotation (5min ack timeout)
   - Level 2: secondary on-call rotation (5min ack timeout)
   - Level 3: Eng-Lead (no timeout)
2. Add the integration's Events-API key to Cloudflare as the secret
   `PAGERDUTY_DLQ_EVENTS_KEY` (or the equivalent Opsgenie key).
3. Update `terraform/cloudflare/alerts.tf` to deliver the
   `click_tracking_dlq_depth` notification to that integration's webhook
   instead of the placeholder email target. The Terraform module
   currently expects an `alert_email`; extend it (or add a sibling
   `alert_pagerduty_webhook` field) so the routing is checked into
   infrastructure-as-code and reviewed on every change.
4. Page severity mapping:
   - Depth ≤ 100 messages → P2 (DLQ filling, no immediate user impact)
   - Depth > 100 messages OR not draining for >30 min → P1 (revenue
     attribution at risk)

### Until that is wired

If the alert is currently delivering by email only, the on-call engineer
is whoever is named in `incident-response.md` "On-call Routing" section.
Treat DLQ overflow as **P2** by default. Escalate to the Eng-Lead if the
queue has not drained 1h after acknowledgement.

### Verification

Run a quarterly drill (pair this with the chaos-game-day cadence):

1. Push a known-poison payload into the click queue.
2. Wait for it to fail 3 retries → land in DLQ.
3. Confirm the alarm fires within the expected window.
4. Confirm the on-call rotation receives the page.
5. Acknowledge, then drain the DLQ following the **Mitigation** steps above.

# DLQ Replay Runbook

**Audit finding:** A44-04 — No auto-replay mechanism from DLQ back to main queue.

**Owner:** Platform / SRE

---

## Context

The `click-tracking-dlq` Cloudflare Queue collects messages that exhausted
all retries in the main `click-tracking` queue. Each dead-letter represents
a click-attribution event that failed to process (e.g., Supabase timeout,
malformed payload, transient 5xx from the DB).

Currently there is **no automatic replay** — dead letters accumulate until
manually replayed or purged.

---

## Manual Replay Procedure

### 1. Inspect the DLQ

```bash
# Tail recent DLQ messages (requires wrangler auth)
npx wrangler queues consumer list click-tracking-dlq
```

Check the alerting-runbook.md DLQ section for alert thresholds.

### 2. Diagnose Root Cause

Before replaying, confirm the underlying issue is resolved:

- Check Supabase status (connection pool, query timeouts)
- Verify the Worker is healthy (`wrangler tail affilite-mix`)
- Review recent deploys that may have introduced a regression

### 3. Replay Messages

```bash
# Replay all messages from DLQ back to the main queue.
# This script reads from the DLQ consumer, re-publishes each message
# to the primary queue, and acknowledges the DLQ message on success.
npx tsx scripts/dlq-replay.ts --queue click-tracking-dlq --target click-tracking
```

If `scripts/dlq-replay.ts` does not exist yet, use the Cloudflare dashboard:

1. Navigate to Workers & Pages → Queues → `click-tracking-dlq`
2. Select messages → "Retry" to re-enqueue them to the main queue

### 4. Monitor

After replay:

- Watch the main queue consumer logs for the replayed batch
- Confirm the queue depth returns to zero
- Check Sentry for any new errors from the replayed messages

---

## Future: Automated Replay

When Cloudflare Queues supports native DLQ retry policies or when traffic
volume justifies it, implement an automated replay consumer:

1. Deploy a scheduled Worker (cron every 15 min) that reads the DLQ
2. For each message, attempt to re-publish to the main queue
3. If the message has been retried > 3 times (track via custom metadata),
   move it to a permanent dead-letter bucket in R2 for manual inspection
4. Alert on the R2 bucket growing (indicates a systemic issue)

---

## Related

- [Alerting Runbook — DLQ section](./alerting-runbook.md#queue-dead-letter-queue-dlq-alerts)
- [DR Runbook](./DR-RUNBOOK.md)
- [Cron Liveness](./cron-liveness.md)

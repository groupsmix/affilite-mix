# Click Queue Scaling and Concurrency Bottleneck

## Overview

The click-tracking queue (`click-tracking`) ingests affiliate click events for processing and storage. This document documents the current concurrency configuration, known bottlenecks, and scaling considerations.

## Current Configuration

As of the latest configuration (wrangler.jsonc), the click-tracking queue consumer is configured with:

- **max_concurrency**: 4 (raised from 2 in S9-H2 / E2-02)
- **max_batch_size**: 100 messages per batch
- **max_batch_timeout**: 5 seconds
- **max_retries**: 3
- **dead_letter_queue**: click-tracking-dlq

## Throughput Calculation

With the current configuration:
- **Drain ceiling**: ~80 messages/second (4 concurrent consumers × 100 messages per batch / 5 seconds)
- **Previous drain ceiling** (before concurrency increase): ~10 messages/second

## Known Bottlenecks

### 1. Concurrency Limit

The `max_concurrency: 4` setting caps the number of simultaneous queue consumers. This is a bottleneck under high traffic conditions because:

- Each consumer processes up to 100 messages in a 5-second batch
- Total throughput is limited to ~80 messages/second
- During traffic spikes (e.g., viral content, marketing campaigns), the queue can backlog if ingress exceeds 80 msg/s

### 2. Database Connection Pooling

The queue consumers write to Supabase Postgres. The concurrency is limited by:
- Supabase connection pool size (default: 60 connections for free tier)
- Circuit breaker protection in `/api/queue/clicks` (S9-H2)
- Each batch is ONE PostgREST batch-insert HTTP call, so DB load scales with concurrency, not message volume

### 3. Retry and DLQ Behavior

- Failed messages are retried up to 3 times
- After exhausting retries, messages go to the DLQ (`click-tracking-dlq`)
- DLQ messages must be manually drained via `npm run drain-dlq`

## Queue Lag Alert

F-13: A queue backlog burn-rate alert is configured in `terraform/cloudflare/alerts.tf`:
- **Alert name**: "Affilite-Mix Queue Backlog Burn Rate"
- **Trigger**: Queue depth exceeds 1000 messages
- **Purpose**: Detect consumer lag or failure
- **Action**: Monitor DLQ, consider increasing concurrency or investigating DB issues

## Scaling Path

### Short-term (Immediate)

1. **Monitor queue depth** via the queue lag alert
2. **Watch DLQ** for failed messages
3. **Review circuit breaker logs** in `/api/queue/clicks`

### Medium-term (Recommended)

1. **Introduce pgbouncer-backed connection pool / Supavisor** to increase available DB connections
2. **Raise concurrency further** (e.g., 4 → 8) after validating under real load
3. **Add queue depth metrics** to track backlog growth rate

### Long-term (End-state)

Per E2-01, the end-state is **full decoupling of click ingestion from Postgres**:
- Click events are written to a high-throughput write-optimized store (e.g., Kafka, R2, or a dedicated click-event table)
- A separate batch job aggregates and writes to the main analytics tables
- This removes the Postgres connection pool as the bottleneck

## Monitoring

### Key Metrics

- **Queue depth**: Number of messages waiting to be processed
- **Consumer lag**: Time from message enqueue to dequeue
- **DLQ size**: Number of failed messages
- **DB connection pool utilization**: Active vs available connections
- **Circuit breaker state**: Open/closed status

### Alerts

- **Queue backlog alert**: Triggers when depth > 1000 messages (configured in alerts.tf)
- **DLQ alert**: Manual monitoring required (consider adding automated alert)
- **DB connection pool alert**: Monitor via Supabase dashboard

## Operational Procedures

### During Queue Backlog

1. Check queue depth in Cloudflare Dashboard
2. Review DLQ for failed messages
3. Check circuit breaker logs for DB errors
4. If DB is healthy, consider temporarily increasing `max_concurrency`
5. If DB is saturated, throttle ingress or scale DB connection pool

### Draining DLQ

Run the DLQ drain script:
```bash
npm run drain-dlq
```

This script:
- Reads messages from `click-tracking-dlq`
- Re-processes them through the click ingestion logic
- Handles retries with backoff
- Reports success/failure statistics

## References

- **Audit finding**: F-13 (click queue concurrency bottleneck)
- **Configuration**: `wrangler.jsonc` (queue consumer settings)
- **Alerts**: `terraform/cloudflare/alerts.tf` (queue_backlog_alert)
- **Circuit breaker**: `/api/queue/clicks` (S9-H2)
- **ADR**: E2-01 (full decoupling from Postgres)

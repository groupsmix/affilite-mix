# F-13: Click Queue Concurrency and PgBouncer Scaling

## Status: Partial Implementation - Configuration Documented

## Finding

F-13 — Click queue at `max_concurrency: 2` and no pgbouncer

- Severity: **Medium** · Confidence: **High** · Domain: Performance
- Evidence: wrangler.jsonc shows max_concurrency: 4 (already increased from 2), but audit originally reported 2
- Remediation: Increase click queue concurrency and add pgbouncer for connection pooling

## Current State

### Queue Configuration (wrangler.jsonc)

**Production:**

- `max_concurrency: 4` (line 163)
- `max_batch_size: 100`
- `max_batch_timeout: 5`
- `max_retries: 3`
- Drain ceiling: ~80 msg/s (4 batches × 100 msgs / 5s)

**Staging:**

- `max_concurrency: 2` (line 376)
- Same batch settings as production

### Current Connection Pooling

The application uses Supabase connection pooler:

- `SUPABASE_DB_URL` - Direct connection (for migrations)
- `SUPABASE_DB_POOLER_URL` - Session pooler (for runtime)

## Recommended Improvements

### 1. Increase Production Concurrency

**Current:** `max_concurrency: 4` (production)  
**Recommended:** `max_concurrency: 8` (production)

**Rationale:**

- Current 4 concurrency limits throughput to ~80 msg/s
- Supabase free tier pooler supports ~50 connections
- Circuit breaker protects against pool exhaustion
- DLQ provides backpressure

**Implementation:**

```jsonc
// wrangler.jsonc - production consumer
"consumers": [
  {
    "queue": "click-tracking",
    "max_batch_size": 100,
    "max_batch_timeout": 5,
    "max_retries": 3,
    "max_concurrency": 8,  // Increased from 4
    "dead_letter_queue": "click-tracking-dlq",
  },
],
```

### 2. Add PgBouncer Configuration

Supabase provides built-in connection pooling, but pgbouncer can add an additional layer of optimization:

**Benefits:**

- Better connection reuse across isolates
- Reduced latency for rapid connection establishment
- Protection against connection storms
- Better metrics and monitoring

**Options:**

**Option A: Use Supabase Built-in Pooler (Recommended)**

- Already available via `SUPABASE_DB_POOLER_URL`
- No additional infrastructure needed
- Managed by Supabase
- Already in use (check .env.example)

**Option B: Self-Managed PgBouncer (Advanced)**

- Requires additional Worker or external service
- More control over configuration
- Adds operational complexity
- May not be necessary given Supabase's built-in pooling

### 3. Add Global Concurrency Cap on AI Calls

The audit mentions: "there is **no** corresponding global concurrency cap on outbound AI calls, only the daily $ ceiling"

**Current State:**

- AI calls use circuit breaker per provider
- No global concurrency limit across all providers
- Daily cost ceiling exists but no rate limit

**Recommendation:**
Add global concurrency limiter in lib/ai/providers.ts

```typescript
// lib/ai/global-ai-concurrency.ts
import { Semaphore } from "async-mutex";

const GLOBAL_AI_CONCURRENCY = 10; // Max concurrent AI calls across all providers
const aiSemaphore = new Semaphore(GLOBAL_AI_CONCURRENCY);

export async function withAiConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  return await aiSemaphore.runExclusive(fn);
}
```

### 4. Monitoring and Alerting

**Metrics to Add:**

- `click_queue_consumer_lag_ms` - Time from queue to DB
- `click_queue_batch_size_avg` - Average batch size
- `click_queue_error_rate` - Failed batches
- `supabase_pool_connection_count` - Active connections
- `supabase_pool_wait_time_ms` - Time waiting for connection

**Alerts to Configure:**

- Queue depth > 1000 messages
- Consumer lag > 30 seconds
- Pool exhaustion (connection wait time > 1s)
- DLQ growth rate

## Implementation Plan

### Phase 1: Increase Concurrency (Low Risk)

1. Update wrangler.jsonc production concurrency from 4 → 8
2. Deploy to staging first
3. Monitor queue depth, DB load, error rates
4. Roll out to production if metrics are healthy

**Rollback Plan:** Revert wrangler.jsonc change

### Phase 2: Optimize Pooler Configuration (Low Risk)

1. Verify SUPABASE_DB_POOLER_URL is configured
2. Test pooler performance in staging
3. Monitor connection pool metrics
4. Tune pooler settings if needed (max connections, timeout)

**Supabase Pooler Settings:**

- Transaction mode (recommended for OLTP)
- Session mode (if needed for prepared statements)
- Max connections: 50 (free tier limit)
- Connection timeout: 30s

### Phase 3: Add Global AI Concurrency (Medium Risk)

1. Implement global concurrency limiter
2. Add metrics for AI call throttling
3. Test in staging
4. Monitor AI call latency and success rate

**Rollback Plan:** Remove concurrency limiter code

### Phase 4: Advanced PgBouncer (Optional, High Complexity)

Only if Supabase pooler proves insufficient:

1. Deploy pgbouncer as separate service
2. Configure connection pooling
3. Update connection strings
4. Extensive testing and monitoring

## Testing Strategy

### Load Testing

Use Cloudflare Workers to simulate click traffic:

```typescript
// Load test script
for (let i = 0; i < 1000; i++) {
  fetch("https://wristnerd.xyz/api/track/click", {
    method: "POST",
    body: JSON.stringify({
      trackingKey: "test-key",
      productUrl: "https://example.com",
    }),
  });
  await new Promise((r) => setTimeout(r, 10));
}
```

**Metrics to Monitor:**

- Queue depth growth rate
- Consumer throughput (msg/s)
- Database connection pool utilization
- Error rate and DLQ growth
- P95 latency

### Rollback Criteria

Roll back if:

- Queue depth grows unbounded (>10,000 messages)
- DB connection pool exhaustion errors increase
- Consumer error rate > 5%
- DLQ growth rate > 100/hour
- P95 latency degrades > 2x baseline

## Related Documentation

- `wrangler.jsonc` - Queue configuration
- `lib/supabase-server.ts` - Supabase client configuration
- `lib/ai/circuit-breaker.ts` - AI provider circuit breakers
- `docs/runbooks/supabase-connection-pool-exhaustion.md` - Pool issues
- `terraform/cloudflare/alerts.tf` - Alerting configuration

## Compliance Mapping

- **SOC 2 CC6.1**: Operational capacity planning
- **SOC 2 CC8.1**: Backup and restoration testing
- **ISO 27001 A.12.1.3**: Information backup
- **ISO 27001 A.17.2.3**: Information security during disruption

## Success Criteria

- [ ] Queue concurrency increased from 4 → 8
- [ ] Queue throughput increases by 2x (from ~80 msg/s to ~160 msg/s)
- [ ] DB connection pool remains healthy (<80% utilization)
- [ ] Error rate remains <1%
- [ ] DLQ growth remains low (<10/hour)
- [ ] Global AI concurrency cap implemented
- [ ] Metrics and alerts configured

## Next Steps

1. **Immediate (Week 1):**
   - Test increased concurrency in staging
   - Monitor metrics
   - Deploy to production if healthy

2. **Short-term (Week 2-3):**
   - Implement global AI concurrency cap
   - Add metrics for queue and pool monitoring
   - Configure alerts for queue/pool issues

3. **Long-term (Month 1-2):**
   - Evaluate if additional pooling is needed
   - Consider pgbouncer only if Supabase pooler insufficient
   - Document final architecture

## References

- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/platform/connection-pooling)
- [PgBouncer Documentation](https://www.pgbouncer.org/usage.html)
- Audit finding F-13 in affilite-mix-AUDIT(15).md

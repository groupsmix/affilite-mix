# Distributed Tracing Strategy

> **R-002**: No distributed tracing across Worker → Supabase → AI providers.

## Current State

- `lib/logger.ts` emits structured JSON with `x-trace-id` correlation
- Sentry captures exceptions but not performance traces across services
- No OpenTelemetry integration
- No latency histograms per provider/tenant

## Architecture

```
Browser → Cloudflare Edge (Custom Worker)
                ↓ x-trace-id header
          Next.js Middleware
                ↓ x-trace-id propagated
          API Route Handler
           ↙        ↘
    Supabase       AI Providers
    (x-trace-id    (x-trace-id
     in headers)    in headers)
```

## Implementation Plan

### Phase 1: Trace Context Propagation (Week 1)

The existing `x-trace-id` in `lib/logger.ts` is already generated per-request.
Propagate it to external calls:

1. **Supabase**: Pass `x-trace-id` as a custom header on the Supabase client.
   The Supabase JS client supports custom headers via `global.headers`.

2. **AI Providers**: Include `x-trace-id` in the request metadata for each
   provider call in `lib/ai/providers.ts`. Log the trace ID alongside
   provider name and latency.

3. **Sentry**: Tag every Sentry event with `traceId` using `Sentry.setTag()`.

### Phase 2: OpenTelemetry Integration (Week 2-3)

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-base
```

Use Cloudflare's OpenTelemetry exporter for Workers:

```typescript
// lib/tracing.ts
import { trace, SpanKind } from "@opentelemetry/api";

const tracer = trace.getTracer("affilite-mix", "1.0.0");

export function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string>,
): Promise<T> {
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: 0 });
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### Phase 3: Latency Histograms (Week 3-4)

Add Sentry Performance Monitoring spans for:

| Span                | What It Measures             |
| ------------------- | ---------------------------- |
| `db.query`          | Supabase query latency       |
| `ai.generate`       | AI provider response time    |
| `ai.moderate`       | Content moderation latency   |
| `stripe.webhook`    | Stripe event processing time |
| `email.send`        | Resend API latency           |
| `kv.get` / `kv.put` | KV read/write latency        |

### Phase 4: Dashboards (Week 4)

Create Sentry Performance dashboards:

- p50/p95/p99 latency per API route
- AI provider latency comparison (Cloudflare vs Gemini vs Groq)
- Supabase query latency by DAL function
- Per-tenant request volume and error rate

## Metrics to Track

| Metric             | Target   | Alert Threshold    |
| ------------------ | -------- | ------------------ |
| API p99 latency    | < 500 ms | > 2 s for 5 min    |
| DB query p95       | < 100 ms | > 500 ms for 5 min |
| AI generation p50  | < 3 s    | > 10 s for 5 min   |
| Click redirect p50 | < 50 ms  | > 200 ms for 5 min |
| Error rate         | < 0.1%   | > 1% for 5 min     |

## Dependencies

- `@opentelemetry/api` — trace context API
- `@opentelemetry/sdk-trace-base` — span export pipeline
- Sentry Performance Monitoring (already available via `@sentry/cloudflare`)
- Cloudflare Workers Logpush (already configured via Tail Worker)

## References

- [Cloudflare Workers Observability](https://developers.cloudflare.com/workers/observability/)
- [OpenTelemetry JS SDK](https://opentelemetry.io/docs/languages/js/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)

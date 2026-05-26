# ADR-0009: Real-Time Architecture Constraints

**Status**: Accepted
**Date**: 2026-05-25
**Context**: R-025 — No WebSocket/real-time scaling consideration documented

## Context

The current architecture is fully request-response. No WebSocket connections,
no Supabase Realtime subscriptions, no Server-Sent Events. Future features
(live analytics dashboards, collaborative content editing, real-time
notifications) would require real-time capabilities.

## Decision

Real-time features are **not on the immediate roadmap**. This ADR documents
the architectural constraints so future engineers understand the trade-offs.

### Current Constraints

1. **Cloudflare Workers do not natively support WebSocket servers** unless
   using Durable Objects. Each DO instance can hold WebSocket connections,
   but the programming model is different from traditional WebSocket servers.

2. **Supabase Realtime** is available but not configured. Enabling it would
   require:
   - Adding `@supabase/realtime-js` client
   - Configuring Supabase Realtime policies (separate from RLS)
   - Managing connection lifecycle in client components

3. **Server-Sent Events (SSE)** work on Cloudflare Workers and are the
   simplest real-time pattern to add. Suitable for one-way updates (e.g.,
   live analytics, deployment status).

### If Real-Time Is Needed

| Feature                  | Recommended Approach                   | Effort |
| ------------------------ | -------------------------------------- | ------ |
| Live analytics dashboard | SSE from `/api/admin/analytics/stream` | Small  |
| Deployment notifications | SSE from a cron-based poller           | Small  |
| Collaborative editing    | Durable Objects + WebSocket            | Large  |
| Real-time chat/comments  | Supabase Realtime                      | Medium |
| Push notifications       | Web Push API (no WebSocket needed)     | Medium |

### Implementation Path (SSE for Analytics)

```typescript
// app/api/admin/analytics/stream/route.ts
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll DB every 5 seconds and push updates
      const interval = setInterval(async () => {
        const stats = await getDashboardStats(siteId);
        send(stats);
      }, 5000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

## Consequences

### Positive

- Architecture remains simple and stateless
- No WebSocket infrastructure to maintain
- Cloudflare Workers edge deployment is straightforward

### Negative

- Admin dashboard requires manual refresh for updated data
- No push-based notifications to admins
- Collaborative features would require significant architecture changes

## Alternatives Considered

1. **Add Supabase Realtime now** — rejected because no current feature
   requires it, and it adds complexity.
2. **Add Durable Objects WebSocket hub** — rejected for the same reason.
3. **Third-party real-time service (Pusher, Ably)** — rejected to avoid
   additional vendor dependency.

# ADR-0014: Worker Decomposition for Reliability

**Status**: Proposed  
**Date**: 2026-06-11  
**Context**: Audit finding F-02 — Single Worker bundle for public + admin + webhook + queue + cron

## Problem

The current architecture has a single Cloudflare Worker (`affilite-mix`) handling:

- All public routes (SSR/ISR/SSG)
- All admin routes
- All API routes
- Stripe webhooks
- Queue consumer (click-tracking)
- Cron jobs

**Risk**: Any deploy that breaks the public path (CSS bug, hydration bug, Next.js minor) breaks Stripe webhook delivery, queue consumer, admin login, and every cron handler. Rollback is whole-bundle.

**Production Scenario**: A non-critical UI change ships → Worker raises an unhandled exception on cold start → Stripe webhook returns 5xx → Stripe disables endpoint after retries → subscriptions don't renew.

## Current State

- Single `affilite-mix` Worker handles all routes
- `affilite-mix-heavy-crons` Worker exists for heavy cron jobs (AI generation, commission ingest, price scrape)
- Heavy-crons pattern proves the path: separate worker that forwards events via HTTP to main app

## Proposed Solution

### Phase 1: Extract Webhook Worker (Immediate)

Create `affilite-mix-webhooks` Worker to handle:

- Stripe webhooks (`/api/membership/webhook`)
- Other third-party webhooks if added later

**Rationale**: Webhooks are critical payment infrastructure and should be isolated from UI changes.

### Phase 2: Extract Queue Worker (Next)

Create `affilite-mix-queue` Worker to handle:

- Click-tracking queue consumer
- DLQ consumer
- Other async processing queues

**Rationale**: Queue processing should continue even if the main app has issues.

### Phase 3: Extract API Worker (Future)

Consider separating admin API routes from public routes for additional isolation.

## Implementation Pattern (Based on Heavy-Crons)

Follow the existing `wrangler.heavy-crons.jsonc` pattern:

```json
{
  "name": "affilite-mix-webhooks",
  "main": "workers/webhooks.ts",
  "triggers": {
    "crons": [],
    "http": {
      "routes": ["api/membership/webhook/*"]
    }
  }
}
```

The worker will forward requests to the main app via HTTP (similar to heavy-crons).

## DAL Sharing Strategy

Options:

1. **Vendored DAL**: Copy shared DAL code to both workers
2. **Private NPM Package**: Extract DAL to private package
3. **HTTP Forwarding**: Workers forward to main app (heavy-crons pattern)

**Recommendation**: Use HTTP forwarding pattern (heavy-crons approach) for simplicity and consistency.

## Implementation Plan

### Phase 1: Webhook Worker

1. Create `wrangler.webhooks.jsonc`
2. Create `workers/webhooks.ts` entry point
3. Update routing to forward webhook requests to main app
4. Add webhook worker to deployment workflow
5. Test webhook delivery end-to-end
6. Update DNS/routing as needed

### Phase 2: Queue Worker

1. Create `wrangler.queue.jsonc`
2. Create `workers/queue.ts` entry point
3. Move queue consumer logic from main worker
4. Update queue bindings and configuration
5. Test queue processing end-to-end
6. Monitor queue performance

### Phase 3: Monitoring & Validation

1. Add separate monitoring for each worker
2. Create health checks for each worker
3. Update runbooks for multi-worker architecture
4. Add integration tests for worker communication

## Benefits

- **Isolation**: UI changes don't affect critical infrastructure
- **Independent Deployment**: Webhook worker can be deployed separately
- **Failure Containment**: One worker failing doesn't bring down everything
- **Scalability**: Different scaling strategies per worker type

## Risks

- **Increased Complexity**: More workers to manage and monitor
- **Communication Overhead**: HTTP forwarding adds latency
- **Deployment Coordination**: Multiple workers to deploy in sequence
- **Testing**: More integration points to test

## Rollback Plan

If issues occur:

1. Revert to single-worker architecture
2. Update DNS/routing to point to main worker
3. Monitor for any data loss (queue backlog, missed webhooks)

## Success Criteria

- Webhook worker handles Stripe webhooks independently
- Queue worker processes click-tracking queue independently
- Main worker failures don't affect webhook/queue processing
- End-to-end tests pass for all worker communication
- Deployment time doesn't increase significantly

## Open Questions

- Should we also separate admin API from public API?
- How should we handle shared state/cache between workers?
- What's the monitoring strategy for multi-worker architecture?

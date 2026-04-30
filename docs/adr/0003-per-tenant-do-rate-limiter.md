# ADR-0003: Per-Tenant Durable Object Rate Limiter

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

Rate limiting in a Cloudflare Workers environment cannot use traditional Redis or in-process counters because V8 isolates are ephemeral and stateless. Options considered:
1. In-memory per-isolate counters (fast but not shared)
2. KV-based counters (eventually consistent, not suitable for tight limits)
3. Durable Objects (strongly consistent, single-point coordination)

## Decision

Use Cloudflare Durable Objects for rate limiting, with KV as a fallback grace layer and in-memory as a last-resort fallback.

## Rationale

- Durable Objects provide strong consistency for counter increments within a single region
- KV provides a grace window (60s) when DO is unavailable, preventing a hard outage
- In-memory fallback (with a 10,000-entry hard cap) prevents total failure if both DO and KV are down
- The tiered approach matches the "fail gracefully" philosophy

## Consequences

- DO is single-region; if the DO's region is down, rate limiting degrades to KV/memory
- KV-failure sliding-window breaker in `lib/quotas.ts` prevents cascading failures
- `RATE_LIMIT_FORCE_CLOSED` kill switch can force-close all rate limits in emergencies

## Evidence

- `lib/rate-limit.ts`, `workers/rate-limiter-do.ts`
- `__tests__/rate-limit-do.test.ts`, `__tests__/rate-limit-fail-open.test.ts`

# ADR-0001: Cloudflare Workers + OpenNext over Vercel

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

The platform needed a deployment target for Next.js 15 App Router. Options considered:

1. Vercel (native Next.js host)
2. Cloudflare Workers via `@opennextjs/cloudflare`
3. Self-hosted Node.js on AWS/GCP

## Decision

Deploy to Cloudflare Workers using `@opennextjs/cloudflare` (OpenNext adapter).

## Rationale

- **Cost:** Cloudflare Workers pricing is dramatically lower than Vercel for the expected traffic volume, especially with R2 (S3-compatible) and KV included.
- **Edge-first:** All compute runs at Cloudflare's edge, giving sub-50ms TTFB globally without explicit regional configuration.
- **Unified platform:** Workers + KV + Queues + R2 + Durable Objects provide a complete serverless stack under one vendor, reducing operational complexity.
- **No vendor lock-in on compute:** OpenNext is an open-source adapter; migrating back to Vercel or to another target is a configuration change, not a rewrite.

## Consequences

- Cloudflare Workers have a 30s CPU limit (50s for crons), requiring chunked processing for long jobs.
- No persistent filesystem; all storage goes through R2 or KV.
- V8 isolate model means module-scope state persists across requests within an isolate (exploited for caching, but requires careful cleanup).
- Some Next.js features (ISR, middleware rewrites) have edge-case differences under OpenNext.

## Evidence

- `open-next.config.ts`, `wrangler.jsonc`, `wrangler.heavy-crons.jsonc`
- `.github/workflows/deploy.yml`

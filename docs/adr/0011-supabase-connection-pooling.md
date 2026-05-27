# ADR-0011: Supabase Connection Pooling Strategy

**Status**: Proposed
**Date**: 2026-05-26
**Context**: etap-3 #3 — single-region Supabase with 60-connection limit

## Problem

All API routes share a single Supabase project with a 60-connection PgBouncer
pool. Under sustained load (10× current traffic), connection exhaustion is
possible — queries queue behind the pool and latency spikes.

## Current State

- Supabase client created per-request via `createClient()`.
- PgBouncer (transaction mode) sits between the app and Postgres.
- Cloudflare Workers are stateless — no persistent connection pool in-process.
- Peak observed concurrent connections: ~15 (well within 60 limit).

## Options Considered

### A — Supavisor (Supabase native)

Supabase's Supavisor replaces PgBouncer with a more scalable pooler. Available
on Pro plan and above. Supports up to 200 connections per project.

**Pros**: Zero code changes, managed by Supabase.
**Cons**: Requires plan upgrade, still single-region.

### B — Read Replicas

Supabase supports read replicas on Team/Enterprise plans. Route read-heavy
queries (product listings, search, category pages) to replicas.

**Pros**: Scales read capacity independently.
**Cons**: Replication lag (acceptable for product catalog), code changes needed
to select read vs write client.

### C — Edge Caching via KV

Already partially implemented — site resolution and negative caching use
Cloudflare KV. Extend caching to frequently-read product/category data with
short TTLs (30–60s).

**Pros**: Eliminates DB connections for cached reads, lowest latency.
**Cons**: Cache invalidation complexity, stale data window.

## Decision

1. **Immediate**: Upgrade to Supavisor (200 connections) via Supabase dashboard.
2. **30 days**: Extend KV caching to product catalog reads (already has
   infrastructure in `lib/site-context.ts`).
3. **60 days**: Evaluate read replicas if traffic exceeds 200 concurrent
   connections.

## Consequences

- Connection headroom increases from 60 → 200 with no code changes.
- KV caching reduces DB load for the highest-traffic pages.
- Read replicas are deferred until justified by traffic growth.

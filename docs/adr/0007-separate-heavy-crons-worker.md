# ADR-0007: Separate Heavy-Crons Worker

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

Cloudflare Workers have a CPU time limit (30s standard, 50s for cron triggers). Some cron jobs (data retention, commission ingest, EPC recompute) may exceed these limits on large datasets.

## Decision

Deploy a separate Cloudflare Worker (`wrangler.heavy-crons.jsonc`) for CPU-intensive cron jobs with its own deploy gate and rollback path.

## Rationale

- Isolates heavy cron execution from the main web-serving worker
- Prevents a runaway cron from consuming the main worker's CPU budget
- Allows independent scaling and configuration (e.g. different CPU limits, separate error budgets)
- Each worker has its own deployment and can be rolled back independently

## Consequences

- Two `wrangler` configs to maintain (`wrangler.jsonc` and `wrangler.heavy-crons.jsonc`)
- Shared code (DAL, lib) is imported by both workers
- Cron lock (`lib/cron-lock.ts`) prevents overlap between workers

## Evidence

- `wrangler.heavy-crons.jsonc`
- `lib/cron-lock.ts`
- `.github/workflows/deploy.yml`

# ADR-0013: Migration Squashing Strategy

**Status**: Proposed
**Date**: 2026-05-26
**Context**: etap-1 #6, etap-2 R-008, etap-3 #14 — 208+ migration files

## Problem

Fresh environment setup replays all 208+ migration files sequentially. This
slows down CI staging resets and local development bootstrapping.

## Current State

- `supabase/migrations/` contains 208+ SQL files.
- `scripts/squash-migrations.mjs` exists but is unused.
- Each migration has a corresponding `-down.sql` rollback.
- CI runs migrations during deploy via `.github/actions/run-migrations/`.

## Proposed Strategy

### Phase 1 — Baseline Snapshot (next sprint)

1. Take a `pg_dump --schema-only` of the current production schema.
2. Save as `supabase/migrations/00000_baseline.sql`.
3. Move all existing migrations to `supabase/migrations/_archive/`.
4. New migrations continue as sequential files after the baseline.

### Phase 2 — Periodic Squashing (quarterly)

Every quarter, or when migration count exceeds 50 since last squash:

1. Run `scripts/squash-migrations.mjs` to generate a new baseline.
2. Verify the squashed migration produces identical schema to the
   individual migrations (`pg_dump` diff).
3. Archive squashed migrations.

### Guard Rails

- Never squash migrations that haven't been applied to production.
- Always verify schema parity before and after squash.
- Keep rollback capability via the `_archive/` directory.

## Decision

Implement Phase 1 in the next sprint. Phase 2 runs on a quarterly cadence.

## Consequences

- Fresh environments bootstrap in seconds instead of minutes.
- CI staging reset becomes faster.
- Historical migration files preserved in `_archive/` for audit trail.

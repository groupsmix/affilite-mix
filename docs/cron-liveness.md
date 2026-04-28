# Cron Liveness Alarms

**Owner:** Platform / SRE
**Code:** [`lib/cron-liveness.ts`](../lib/cron-liveness.ts)
**Registry:** [`lib/cron-registry.ts`](../lib/cron-registry.ts)

This document records the cadence contract for every scheduled job in
Affilite-Mix and the alarm threshold enforced by the cron liveness system.

---

## How it works

Every cron route calls `recordCronLiveness(<job-name>)` on success. The
timestamp is written to `APP_CACHE_KV` under `cron-liveness:<job-name>`
with a 7-day TTL.

The highest-frequency job (`publish`, every 5 minutes) additionally calls
`checkCronLiveness()`, which walks every entry in `cronJobs` whose
`alertOnFailure: true` and emits a structured `cron_liveness_miss` log
for any job that has not reported within its expected window.

### Alarm threshold — "two consecutive runs skipped" (G-52)

A job is considered **missed** when:

```
now − last_success_timestamp  >  (expected_interval × 2) + 10 minutes
```

The `+10 minutes` buffer absorbs normal Cloudflare cron scheduling jitter.
In effect this is the "two consecutive runs skipped" rule: the alarm does
not fire on a single missed run (which is usually noise), but it _does_
fire if two expected ticks pass with no liveness record.

Missed jobs produce a structured log line that Logpush → Sentry alerting
picks up automatically; see
[`docs/alerting-runbook.md`](alerting-runbook.md) for the alert
configuration.

---

## Expected cadence

All schedules are defined in `lib/cron-registry.ts` (single source of
truth — wrangler, middleware, routes, and `.env.example` are tested to
agree with it). The table below is generated from that registry; update
both when adding a new job.

| Job                 | Schedule      | Expected interval | Alert threshold\* | `alertOnFailure` | Worker      |
| ------------------- | ------------- | ----------------- | ----------------- | ---------------- | ----------- |
| `publish`           | `*/5 * * * *` | 5 min             | 20 min            | yes              | main        |
| `expire-deals`      | `0 * * * *`   | 1 h               | 2 h 10 min        | no               | main        |
| `stripe-sync`       | `0 1 * * *`   | 24 h              | 48 h 10 min       | yes              | main        |
| `ai-generate`       | `0 2 * * *`   | 24 h              | 48 h 10 min       | no               | heavy-crons |
| `sitemap-refresh`   | `0 3 * * *`   | 24 h              | 48 h 10 min       | no               | main        |
| `data-retention`    | `0 4 * * *`   | 24 h              | 48 h 10 min       | yes              | main        |
| `commission-ingest` | `0 5 * * *`   | 24 h              | 48 h 10 min       | yes              | heavy-crons |
| `epc-recompute`     | `0 6 * * *`   | 24 h              | 48 h 10 min       | yes              | main        |
| `price-scrape`      | `0 7 * * *`   | 24 h              | 48 h 10 min       | yes              | heavy-crons |

\* Threshold = `expected_interval × 2 + 10 min`. Jobs with
`alertOnFailure: false` still record liveness but their miss does not
page — see `lib/cron-registry.ts` for which jobs are low-stakes.

---

## Adding a new cron

1. Append the `CronJob` entry to `cronJobs` in `lib/cron-registry.ts`.
2. In the route handler, call `recordCronLiveness("<job-name>")` on the
   success path.
3. Update this table.
4. Set `alertOnFailure: true` for anything whose silent failure would
   cause user-visible or revenue-impacting drift.

The `__tests__/cron-registry.test.ts` suite enforces that the registry,
wrangler configs, middleware, and `.env.example` stay in sync.

---

## Verifying alarms

To confirm the alarm path end-to-end without actually missing a run:

```bash
# Clear the liveness key for a job, then wait for the `publish` cron
# (every 5 min) to run checkCronLiveness().
npx wrangler kv key delete --binding APP_CACHE_KV "cron-liveness:stripe-sync"
```

The next `publish` execution will log `cron_liveness_miss` for
`stripe-sync`. Re-running the `stripe-sync` cron restores liveness.

---

## Related docs

- [`docs/alerting-runbook.md`](alerting-runbook.md) — Sentry / Logpush alert wiring
- [`docs/ops/production-readiness.md`](ops/production-readiness.md) — cron alert acceptance criteria
- [`docs/secrets-rotation-runbook.md`](secrets-rotation-runbook.md) — per-trigger cron secrets

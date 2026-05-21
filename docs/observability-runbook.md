# Observability Runbook

Audit R-008.

## Sink overview

```
main Worker (affilite-mix)
   │ tail_consumers
   ▼
log-shipper Worker  ──►  R2 affilite-mix-logs  (durable, 365d)
                    │
                    └──►  ALERT_WEBHOOK_URL  (PagerDuty / Slack / Logtail)

Cloudflare Workers Analytics Engine  ──►  audit_events / ai_invocation
                                          dashboards (90d)

Sentry (NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN)
                                          ──►  exceptions, releases
```

## Alert routing

| Event shape             | Source                                                            | Sink                                |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| Worker threw uncaught   | Cloudflare tail event with `outcome="exception"`                  | log-shipper → R2 + webhook          |
| `[scheduled]` failure   | `console.error` from `workers/custom-worker.ts` cron path         | log-shipper → R2 + webhook          |
| `[queue/...]` failure   | `console.error` from queue consumer                               | log-shipper → R2 + webhook          |
| `Health check:` failure | `console.error` from `app/api/health/route.ts`                    | log-shipper → R2 + webhook + Sentry |
| Auth failure burst      | `audit_events` (lib/audit-log.ts) with `event_type='auth.failed'` | Workers Analytics Engine alert      |
| RLS denial burst        | `audit_events` with `event_type='rls.denied'`                     | Workers Analytics Engine alert      |
| Migration failure       | `deploy.yml` `migrate-production` job failure                     | GitHub Actions notification         |

## Rotations

- On-call rotation lives in `docs/oncall.md` and is the recipient of
  the `ALERT_WEBHOOK_URL`.
- Secondary on-call covers the log-shipper Worker itself; if it
  silently dies, the main Worker keeps running but logs only flow
  through the dashboard. Fail-safe: the Workers Analytics Engine
  metrics still alert on exceptions even if the tail consumer stops.

## Drills

Quarterly observability drill:

1. Deliberately throw from a non-production cron route (use the
   `/api/cron/_drill` test endpoint, gated by `CRON_DRILL_TOKEN`).
2. Confirm the event appears in:
   a. R2 `affilite-mix-logs/...` within 60s,
   b. The on-call paging channel within 90s,
   c. Sentry `affilite-mix` project within 60s.
3. Record evidence in `docs/evidence/observability-drill-<YYYYQn>.md`.

## Maintenance Mode (Mute the World)

The application can be placed in maintenance mode (returning 503 to all public requests) via the `MAINTENANCE_MODE` secret or KV flag.

### Activation
1. Set the KV flag: `wrangler kv:key put --binding=RATE_LIMIT_KV "maintenance_mode" "true"`.
2. Or set the secret: `wrangler secret put MAINTENANCE_MODE` and enter `true`.

### Instant Propagation (Bypassing Isolate Cache)
The maintenance flag is cached in-memory per isolate for **30 seconds**. To force an instant global flip:
1. Trigger a redeploy or `wrangler touch` to recycle isolates (fastest global way).
2. Or wait the 30s grace window.

### Verification
Confirm by hitting the homepage; you should receive a branded 503 response with a correlation ID.

## Recovering from sink loss

If R2 or the webhook is unavailable:

- Cloudflare buffers tail events for the configured retention window
  (~3 hours for tail consumers). If we restore the shipper within that
  window, no events are lost.
- If retention is exceeded, exceptions are still in Sentry; logs are
  reconstructible only from Cloudflare Analytics Engine (sampled).
- Document the gap in `docs/incidents/<date>-observability-outage.md`.

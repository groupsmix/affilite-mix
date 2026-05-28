# Incident Response Runbook

> audit5-#38: severity matrix, escalation paths, and comms templates for
> production incidents on `affilite-mix`. This runbook is the entry point;
> system-specific runbooks (DLQ overflow, KV outage, supabase pool, Stripe
> webhook, etc.) live in this same directory and are linked below.

## Severity Matrix

| Severity | Definition                                                 | Examples                                                                                                                    | Initial Response                               | Notify                   |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| **P0**   | Site fully down or revenue-impacting data loss in progress | Public site returns 5xx for >50% of requests; click-tracking dropping >10%; Stripe webhook signature rejecting valid events | Within 15 min, 24/7                            | On-call + Eng-Lead + CEO |
| **P1**   | Major feature broken, no workaround                        | Login broken; admin can't publish; affiliate clicks 404; cron not firing                                                    | Within 1h, business hours; on-call after-hours | On-call + Eng-Lead       |
| **P2**   | Degraded experience, workaround exists                     | Slow LCP on one template; one cron job missing one window; DLQ depth above threshold but draining                           | Within 4h business hours                       | On-call                  |
| **P3**   | Cosmetic / low-impact                                      | Typo in error message; rare 404; non-blocking lint warning in prod logs                                                     | Next business day                              | Ticket in backlog        |

## Escalation Path

1. **First responder** is whoever holds the current on-call rotation handle (see "On-call routing" below). They:
   - Acknowledge the page within 5 min for P0/P1, 30 min for P2.
   - Open an incident channel in Slack: `#inc-YYYYMMDD-<short-name>`.
   - Post the symptom + their hypothesis as the first message; pin it.

2. **Page Eng-Lead** if any of:
   - First responder cannot acknowledge within the SLA.
   - Incident is >2h old and not mitigated.
   - Public-facing impact crosses 10% of users.

3. **Page CEO** if any of:
   - P0 has been mitigated but >1h of downtime is in play.
   - Customer data is confirmed leaked (any quantity).
   - Press / external comms required.

## On-call Routing (placeholder — fill in before launch)

Until PagerDuty / Opsgenie rotation IDs are wired:

- Primary: `@<primary-name>` in Slack `#engineering`
- Secondary: `@<secondary-name>`
- Eng-Lead: `@<eng-lead>`
- CEO: `@<ceo>`

Replace with the real rotation handle in `terraform/cloudflare/alerts.tf`
`alert.action` once the rotation is created. See finding `audit5-#28` for
DLQ-specific routing requirements.

## Communication Templates

### Status-page update (P0/P1, public)

```
[INVESTIGATING] We're aware of an issue affecting <feature>. Started <UTC time>.
We're investigating and will post an update within 30 min.
```

```
[IDENTIFIED] We've identified the cause of <issue> as <root cause in one sentence>.
A fix is being deployed. Next update by <UTC time>.
```

```
[RESOLVED] <issue> has been resolved. <duration of impact>. Full post-mortem
will be published within 5 business days.
```

### Internal Slack opener

```
:rotating_light: Incident channel opened.

  Severity: P0 / P1 / P2
  Symptom:  <one-line user-visible description>
  Started:  <UTC timestamp>
  Impact:   <users affected, features affected>
  Owner:    @<first-responder>
  Status:   investigating
```

## Mitigation First, Root-Cause After

The first-responder's job is to **stop the bleeding** — not to find the
root cause. Acceptable mitigations include:

- Rolling back the most-recent deploy (`wrangler rollback`).
- Disabling the failing feature flag (e.g., `MAINTENANCE_MODE=1`).
- Throttling traffic at the Cloudflare WAF.
- Putting the affected route into read-only mode.

Root-cause analysis happens in the post-mortem. **Don't debug in prod
while users are impacted.**

## Post-Mortem

Within **5 business days** of any P0 or P1, write a blameless post-mortem
in `docs/post-mortems/YYYY-MM-DD-<short-name>.md` containing:

1. **Timeline** (UTC) — when each event happened.
2. **Impact** — users, revenue, data.
3. **Root cause** — what actually went wrong (the code/config/system).
4. **Trigger** — what change caused it.
5. **Detection** — how we found out (alert / customer report / dashboard).
6. **What went well** / **What went badly**.
7. **Action items** — owner + due date.

## Related runbooks

- `dlq-overflow.md` — click-tracking DLQ depth alert
- `kv-outage.md` — rate-limit KV unavailability
- `supabase-connection-pool-exhaustion.md` — DB connection saturation
- `stripe-webhook-failure.md` — webhook signature / idempotency issues
- `cloudflare-zone-incident.md` — Cloudflare-level outage
- `database-outage.md` — Supabase / Postgres outage
- `database-migration-rollback.md` — rolling back a bad migration
- `certificate-rotation.md` — TLS cert renewal flow
- `secret-rotation-execution.md` — JWT / API key rotation
- `ai-provider-failover.md` — AI provider rate-limit / outage
- `r2-orphan-cleanup.md` — R2 garbage collection
- `tenant-onboarding-offboarding.md` — site lifecycle
- `chaos-game-day.md` — quarterly chaos exercises

# Alerting & Pager Runbook

This document describes how alerts are routed, who gets paged, and how to configure alerting for Affilite-Mix.

---

## Alert Sources

| Source | What It Catches | Setup Status |
| --- | --- | --- |
| **Sentry** (server) | Unhandled exceptions, captured errors | `@sentry/cloudflare` — requires `SENTRY_DSN` |
| **Sentry** (client) | Browser JS errors, unhandled rejections | `@sentry/browser` — requires `NEXT_PUBLIC_SENTRY_DSN` |
| **Cloudflare Analytics** | 5xx rate spikes, Worker CPU limits exceeded | Built-in with Workers dashboard |
| **External uptime monitor** | Endpoint availability from external perspective | Recommended: Better Stack / UptimeRobot |
| **Health endpoint** | DB connectivity, KV binding, Resend API, env vars | `GET /api/health` (authenticated) |
| **Cron monitoring** | Missed scheduled jobs | Cloudflare Workers logs / cron monitor service |

---

## Alert Severity Levels

| Severity | Criteria | Response Time | Notification Channel |
| --- | --- | --- | --- |
| **P1 — Critical** | Revenue-impacting: all sites down, click tracking broken, auth completely failing | < 15 minutes | Phone/SMS page + Slack `#incidents` |
| **P2 — High** | Degraded service: elevated error rates, single site down, admin panel inaccessible | < 1 hour | Slack `#incidents` + email |
| **P3 — Medium** | Non-urgent: cron delays, email delivery degraded, non-critical feature broken | < 4 hours | Slack `#alerts` |
| **P4 — Low** | Informational: error budget warning, dependency deprecation, perf regression | Next business day | Slack `#alerts` |

---

## Sentry Alert Configuration

### Recommended Alert Rules

Create these in **Sentry → Alerts → Create Alert Rule**:

#### 1. Error Spike (P1/P2)

```
Condition: Number of events > 50 in 5 minutes
Filter: is:unresolved level:error
Action: Notify #incidents channel + page on-call
```

#### 2. New Issue (P3)

```
Condition: A new issue is created
Filter: level:error OR level:fatal
Action: Notify #alerts channel
```

#### 3. Auth Failures (P2)

```
Condition: Number of events > 10 in 5 minutes
Filter: tags[transaction]:/api/auth/* level:error
Action: Notify #incidents channel
```

#### 4. Click Tracking Errors (P2)

```
Condition: Number of events > 5 in 10 minutes
Filter: tags[transaction]:/api/track/click level:error
Action: Notify #incidents channel (revenue impact)
```

#### 5. Error Budget Warning (P4)

```
Condition: Error count > (monthly budget × 0.25) in 7 days
Action: Notify #alerts channel
```

---

## External Uptime Monitoring

### Setup (Better Stack / UptimeRobot)

Configure monitors for each production domain:

| Monitor | URL | Method | Interval | Expected |
| --- | --- | --- | --- | --- |
| Health (authenticated) | `https://wristnerd.site/api/health` | GET + `Authorization: Bearer $CRON_SECRET` | 60s | 200 + `"status":"healthy"` |
| Homepage | `https://wristnerd.site/` | GET | 60s | 200 |
| Admin login | `https://wristnerd.site/admin/login` | GET | 300s | 200 |
| Click tracking | `https://wristnerd.site/api/track/click` | POST (empty) | 300s | 400 (validates endpoint is up) |

### Multi-Region Checks

Configure checks from at least 3 regions to distinguish between regional Cloudflare issues and global outages:
- US East
- EU West
- Asia Pacific

---

## Cloudflare Workers Alerts

### Built-in Notifications

In **Cloudflare Dashboard → Notifications**:

1. **Workers Daily Usage** — alert if daily requests exceed normal baseline by 3x (potential DDoS or bot traffic)
2. **Workers Error Rate** — alert if 5xx rate exceeds 1% of total requests
3. **Workers CPU Time** — alert if p99 CPU time exceeds 30ms (approaching Worker limits)

### Cron Job Monitoring

Option A — **Cron monitoring service** (e.g., Better Stack Heartbeats, Cronitor):
1. Create a heartbeat monitor with a 10-minute grace period
2. Add a ping to the end of `/api/cron/publish` on success
3. Alert if no heartbeat received within the grace period

Option B — **Log-based monitoring**:
1. Search Cloudflare Workers logs for `[scheduled]` entries
2. Alert if fewer than expected entries in a 15-minute window

---

## On-Call Rotation

### Recommended Setup

| Role | Responsibility | Tools |
| --- | --- | --- |
| **Primary on-call** | Responds to P1/P2 within SLA | PagerDuty / Opsgenie / Better Stack |
| **Secondary on-call** | Escalation if primary doesn't acknowledge in 15 min | Same tool, escalation policy |
| **Incident commander** | Coordinates response for P1 incidents lasting > 30 min | Defined per-incident |

### Escalation Policy

```
0 min  → Notify primary on-call (Slack + push notification)
5 min  → Phone call to primary on-call
15 min → Escalate to secondary on-call
30 min → Escalate to engineering lead
```

---

## Trace ID Integration

All alerts should include the `traceId` when available. This enables:

1. **Sentry → Logs**: Search Cloudflare logs for `"traceId":"<value>"` to see the full request lifecycle
2. **Logs → Sentry**: The `traceId` tag on Sentry events links back to the originating request
3. **Response headers**: The `x-trace-id` response header lets users/support include trace context in bug reports

When investigating an alert:
```bash
# Find all log entries for a specific trace
# (in Cloudflare Workers Logs or your log aggregator)
grep '"traceId":"<trace-id-value>"' logs.json

# Or in Sentry: search for the tag
# Sentry Dashboard → Issues → Search: traceId:<value>
```

---

## Quick Reference: "I Just Got Paged"

1. **Check Sentry** — look at the latest unresolved errors and their trace IDs
2. **Check `/api/health`** — `curl -H "Authorization: Bearer $CRON_SECRET" https://wristnerd.site/api/health | jq .`
3. **Check Cloudflare Dashboard** — Workers analytics for 5xx rate and request volume
4. **Check recent deploys** — was there a deployment in the last hour? Consider rollback (see [rollback-strategy.md](./rollback-strategy.md))
5. **Communicate** — post in `#incidents` with what you know so far
6. **Follow incident response** — see [incident-response.md](./incident-response.md)

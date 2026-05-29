# Service Level Objectives (SLOs)

This document defines the SLOs for Affilite-Mix's key user-facing surfaces. Each SLO has an error budget, measurement method, and escalation criteria.

---

## Terminology

| Term             | Definition                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| **SLI**          | Service Level Indicator — the metric being measured                    |
| **SLO**          | Service Level Objective — the target threshold for the SLI             |
| **Error budget** | The amount of allowed failure before the SLO is breached (100% − SLO)  |
| **Burn rate**    | How fast the error budget is being consumed relative to the SLO window |

---

## 1. Public Pages (Homepage, Content, Categories, Search)

These are the revenue-critical pages that drive affiliate traffic.

| SLI                              | SLO                           | Error Budget (30-day) | Measurement                            |
| -------------------------------- | ----------------------------- | --------------------- | -------------------------------------- |
| Availability (non-5xx responses) | 99.9%                         | 43 minutes downtime   | Cloudflare Analytics → 5xx rate        |
| p95 latency (TTFB)               | < 800ms                       | —                     | Web Vitals (`/api/vitals` TTFB metric) |
| p99 latency (TTFB)               | < 2000ms                      | —                     | Web Vitals (`/api/vitals` TTFB metric) |
| Core Web Vitals (LCP)            | < 2.5s for 75% of page loads  | —                     | Web Vitals (`/api/vitals` LCP metric)  |
| Core Web Vitals (CLS)            | < 0.1 for 75% of page loads   | —                     | Web Vitals (`/api/vitals` CLS metric)  |
| Core Web Vitals (INP)            | < 200ms for 75% of page loads | —                     | Web Vitals (`/api/vitals` INP metric)  |

**Escalation:**

- If availability drops below 99.5% in any 1-hour window → page on-call (see [alerting-runbook.md](./alerting-runbook.md))
- If p95 TTFB exceeds 2s for 15+ minutes → investigate Supabase latency / Worker cold starts

---

## 2. Authentication (Login, Logout, Password Reset)

Auth failures directly block admin workflows and content management.

| SLI                                    | SLO      | Error Budget (30-day) | Measurement                                          |
| -------------------------------------- | -------- | --------------------- | ---------------------------------------------------- |
| Availability (non-5xx responses)       | 99.95%   | 21 minutes downtime   | Structured logs: `POST /api/auth/*` 5xx count        |
| Login success rate (valid credentials) | > 99%    | —                     | Ratio of 200 to (200 + 500) on `/api/auth/login`     |
| Login latency p95                      | < 1500ms | —                     | Structured logs: response time for `/api/auth/login` |

**Escalation:**

- Login 5xx rate > 5% for 5 minutes → page on-call
- Login latency p95 > 3s for 10 minutes → check Supabase / bcrypt cost factor

---

## 3. Admin Panel (CMS, Products, Categories, Analytics)

Admin operations have a slightly lower availability bar but should not silently lose data.

| SLI                              | SLO      | Error Budget (30-day) | Measurement                                                   |
| -------------------------------- | -------- | --------------------- | ------------------------------------------------------------- |
| Availability (non-5xx responses) | 99.5%    | 3.6 hours downtime    | Structured logs: `/api/admin/*` 5xx count                     |
| Data mutation success rate       | > 99.9%  | —                     | Ratio of 2xx to (2xx + 5xx) on POST/PUT/DELETE `/api/admin/*` |
| Admin page load p95              | < 2000ms | —                     | Web Vitals filtered to `/admin/*` paths                       |

**Escalation:**

- Admin 5xx rate > 10% for 5 minutes → alert on-call
- Any data mutation returning 500 with `audit_log` insert failure → investigate immediately (data integrity risk)

---

## 4. Scheduled Jobs (Cron: Publish, Sitemap Refresh)

Cron reliability ensures content goes live on schedule.

| SLI                         | SLO   | Error Budget (30-day)                    | Measurement                                                   |
| --------------------------- | ----- | ---------------------------------------- | ------------------------------------------------------------- |
| Cron execution success rate | > 99% | ~4 missed runs/month (at 5-min interval) | Cloudflare Workers logs: `[scheduled]` entries                |
| Cron latency p95            | < 10s | —                                        | Time from `scheduled` trigger to `/api/cron/publish` response |

**Escalation:**

- 3 consecutive cron failures → alert on-call
- Cron latency > 30s → check Supabase query performance

---

## 5. Affiliate Click Tracking

Click tracking is the core revenue measurement. Lost clicks = lost attribution.

| SLI                          | SLO     | Error Budget (30-day) | Measurement                                   |
| ---------------------------- | ------- | --------------------- | --------------------------------------------- |
| Click recording availability | 99.9%   | 43 minutes            | Structured logs: `/api/track/click` 5xx count |
| Click recording latency p95  | < 500ms | —                     | Should not delay the user redirect            |

**Escalation:**

- Click tracking 5xx rate > 1% for 10 minutes → alert on-call (revenue impact)

---

## 6. Newsletter Signups

| SLI                              | SLO   | Error Budget (30-day) | Measurement                                  |
| -------------------------------- | ----- | --------------------- | -------------------------------------------- |
| Signup availability              | 99.5% | 3.6 hours             | Structured logs: `/api/newsletter` 5xx count |
| Confirmation email delivery rate | > 95% | —                     | Resend delivery webhooks / health check      |

**Escalation:**

- Resend health check failing → alert in Slack (see health endpoint `checks.email`)

---

## Error Budget Policy

When an SLO's error budget is exhausted (or projected to exhaust within the window):

1. **Freeze non-critical deploys** — only ship fixes for the breached SLO
2. **Allocate engineering time** — at least one person dedicated to reliability until budget recovers
3. **Post-mortem required** — any incident that consumes > 25% of a monthly error budget triggers a post-mortem (see [incident-response.md](./incident-response.md))
4. **Review burn rate** — if 50% of budget is consumed in the first week, proactively investigate

## Multi-Window Multi-Burn-Rate Alert Rules

S3-006: Automated burn-rate alerts based on Google SRE Workbook ch. 5.
Each SLO surface should have both a fast-burn and slow-burn alert rule configured
in the alerting backend (Sentry, Better Stack, or Cloudflare notifications).

### Fast-Burn Alerts (page-worthy)

| Surface            | SLO    | Burn Rate | Long Window | Short Window | Action        |
| ------------------ | ------ | --------- | ----------- | ------------ | ------------- |
| Public pages       | 99.9%  | 14.4×     | 1h          | 5m           | Page on-call  |
| Auth               | 99.95% | 14.4×     | 1h          | 5m           | Page on-call  |
| Click tracking     | 99.9%  | 14.4×     | 1h          | 5m           | Page on-call  |
| Admin panel        | 99.5%  | 14.4×     | 1h          | 5m           | Alert on-call |
| Cron jobs          | 99%    | 14.4×     | 1h          | 5m           | Alert on-call |
| Newsletter signups | 99.5%  | 14.4×     | 1h          | 5m           | Alert on-call |

### Slow-Burn Alerts (ticket-worthy)

| Surface            | SLO    | Burn Rate | Long Window | Short Window | Action        |
| ------------------ | ------ | --------- | ----------- | ------------ | ------------- |
| Public pages       | 99.9%  | 6×        | 6h          | 30m          | Create ticket |
| Auth               | 99.95% | 6×        | 6h          | 30m          | Create ticket |
| Click tracking     | 99.9%  | 6×        | 6h          | 30m          | Create ticket |
| Admin panel        | 99.5%  | 6×        | 6h          | 30m          | Create ticket |
| Cron jobs          | 99%    | 6×        | 6h          | 30m          | Create ticket |
| Newsletter signups | 99.5%  | 6×        | 6h          | 30m          | Create ticket |

### Alert Rule Formula

For a 30-day SLO window:

```
error_rate > (1 - SLO) × burn_rate
  AND sustained for short_window
```

Example for Public Pages (99.9%, fast-burn 14.4×):

- Threshold: `(1 - 0.999) × 14.4 = 0.0144` → 1.44% error rate
- Fires when 5xx rate exceeds 1.44% for 5 minutes within a 1-hour window

---

## Measurement Infrastructure

### Current

| Signal          | Source                                  | Notes                                             |
| --------------- | --------------------------------------- | ------------------------------------------------- |
| Server errors   | Sentry (`@sentry/cloudflare`)           | Captures exceptions with trace-id tags            |
| Client errors   | Sentry (`@sentry/browser`)              | Captures browser exceptions, unhandled rejections |
| Structured logs | `lib/logger.ts` → Cloudflare log stream | JSON format with `traceId` field for correlation  |
| Web Vitals      | `/api/vitals` → `web_vitals` DB table   | LCP, CLS, INP, FCP, TTFB per page                 |
| Health checks   | `/api/health`                           | DB, KV, Resend, env var checks                    |
| Request tracing | `x-trace-id` header (middleware)        | Propagated through all API routes and logs        |

### Recommended Additions

- [ ] **External uptime monitor** (Better Stack, UptimeRobot, or Cloudflare Health Checks) polling `/api/health` every 60s from multiple regions
- [ ] **Sentry alert rules** for error rate spikes (> 10 errors/min) and new issue notifications
- [ ] **Cloudflare Workers Analytics** dashboard for 5xx rate, request count, and CPU time
- [ ] **Log aggregation** (Datadog, Logpush to R2, or Cloudflare Logpush) for querying structured logs at scale

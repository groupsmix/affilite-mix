# Service Level Objectives (SLOs)

Targets for availability, latency, and error rates. These define the error
budget that burn-rate alerts (see `terraform/cloudflare/alerts.tf`) consume.

## Availability

| Service                             | Target          | Measurement                                              |
| ----------------------------------- | --------------- | -------------------------------------------------------- |
| Public pages (SSR/ISR)              | 99.9 % monthly  | Cloudflare analytics — non-5xx / total                   |
| Admin panel                         | 99.5 % monthly  | Cloudflare analytics — non-5xx / total for `/q7m-k4j9/*` |
| Click tracking (`/api/track/click`) | 99.9 % monthly  | Queue success rate + 302 success rate                    |
| Cron jobs                           | 100 % execution | `cron_liveness` KV heartbeat — 0 missed in 24 h          |

## Latency

| Endpoint             | p50      | p99      | Measurement               |
| -------------------- | -------- | -------- | ------------------------- |
| Public page TTFB     | ≤ 200 ms | ≤ 400 ms | Lighthouse CI / synthetic |
| Click redirect (302) | ≤ 50 ms  | ≤ 150 ms | Cloudflare Worker timing  |
| Admin login          | ≤ 300 ms | ≤ 800 ms | Server timing header      |
| Admin list endpoints | ≤ 200 ms | ≤ 500 ms | Server timing header      |
| Sitemap generation   | —        | ≤ 5 s    | Cron telemetry            |

## Error Budget

Monthly error budget = `100 % − SLO target`.

- Public pages: 0.1 % → ~43 minutes/month of acceptable downtime.
- Admin panel: 0.5 % → ~3.6 hours/month.
- Click tracking: 0.1 % → ~43 minutes/month.

When the remaining budget drops below 25 %, freeze non-critical deploys and
investigate reliability.

## Web Vitals

Enforced via Lighthouse CI (`lighthouserc.cjs`):

| Metric                 | Budget    |
| ---------------------- | --------- |
| First Contentful Paint | ≤ 1800 ms |
| Total Blocking Time    | ≤ 300 ms  |

## Alert Wiring

Burn-rate alerts are defined in `terraform/cloudflare/alerts.tf`. They fire
when the error rate over a rolling window consumes the budget faster than
expected.

**Prerequisite:** `alert_mechanisms` in `alerts.auto.tfvars` must contain real
PagerDuty service IDs and/or email addresses. Empty mechanisms = silent alerts.

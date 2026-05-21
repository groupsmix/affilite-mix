# Service Level Objectives (SLO) — F-023

## SLO Definitions

### 1. Public Page Availability

- **Target:** 99.9% per month (43 min downtime)
- **Measurement:** (2xx responses / total requests)

### 2. Admin API Latency (p95)

- **Target:** ≤ 500ms at p95
- **Applies to:** /api/admin/\*

### 3. Stripe Webhook Success

- **Target:** ≥ 99.5% successful processing

### 4. Public API Response

- **Target:** ≤ 200ms at p95
- **Applies to:** `/api/community/*`, `/api/newsletter/*`

## Error Budget Policy

| Consumed | Action            |
| -------- | ----------------- |
| 50%      | Warning alert     |
| 75%      | Page on-call      |
| 100%     | Incident response |

## Alerting

### Naive alerts (existing)

```yaml
# Sentry alerts
- name: "High Error Rate" → error_rate > 0.1%
- name: "Admin Latency" → p95 > 500ms
- name: "Webhook Failures" → 5xx > 10/min
```

### Multi-window multi-burn-rate alerts (A85)

Per Google SRE Workbook Chapter 5, the following burn-rate alerts replace naive threshold alerts for budget-aware incident detection:

**Public Page Availability (99.9% SLO, 0.1% error budget/month)**

| Severity    | Short window | Long window | Burn rate | Budget consumed | Action                                     |
| ----------- | ------------ | ----------- | --------- | --------------- | ------------------------------------------ |
| P1 (page)   | 5 min        | 1 hour      | 14.4x     | 2% in 1h        | Page on-call immediately                   |
| P2 (page)   | 30 min       | 6 hours     | 6x        | 5% in 6h        | Page on-call                               |
| P3 (ticket) | 2 hours      | 24 hours    | 3x        | 10% in 24h      | File ticket, investigate next business day |
| P4 (ticket) | 6 hours      | 72 hours    | 1x        | 10% in 3d       | File ticket, review at weekly SLO meeting  |

**Alert formula:**

```
ALERT IF:
  error_rate(short_window) >= burn_rate * SLO_error_rate
  AND error_rate(long_window) >= burn_rate * SLO_error_rate
```

For 99.9% SLO (error_rate = 0.1%):

- P1: `error_rate(5m) >= 1.44% AND error_rate(1h) >= 1.44%`
- P2: `error_rate(30m) >= 0.6% AND error_rate(6h) >= 0.6%`
- P3: `error_rate(2h) >= 0.3% AND error_rate(24h) >= 0.3%`
- P4: `error_rate(6h) >= 0.1% AND error_rate(72h) >= 0.1%`

**Click Tracking (99.9% SLO)**
Same burn-rate windows as Public Page Availability applied to `/api/track/click` and `/r/[shortcode]` 5xx rate.

**Stripe Webhook (99.5% SLO, error_rate = 0.5%)**

- P1: `failure_rate(5m) >= 7.2% AND failure_rate(1h) >= 7.2%`
- P2: `failure_rate(30m) >= 3.0% AND failure_rate(6h) >= 3.0%`

**Latency SLOs (p95 TTFB < 800ms)**

- SLI: Aggregated hourly from `web_vitals` table (`SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY value) FROM web_vitals WHERE metric_name = 'TTFB' AND created_at > now() - interval '1 hour'`)
- Alert: p95 TTFB > 800ms for 2 consecutive hourly windows

### Implementation notes

- Sentry performance alerts support custom query windows; configure via `terraform/cloudflare/sentry-alerts.tf`
- Cloudflare Workers Analytics provides CPU time per route for latency SLIs
- Both short and long windows must fire simultaneously to prevent alert noise from single-spike events
- Fast-burn alerts (P1/P2) page on-call; slow-burn (P3/P4) file a ticket

## Error Budget Remaining Dashboard

Recommend building an admin page (`/admin/slo-dashboard`) that displays:

- Current 30-day error budget remaining per SLO
- Current burn rate (trailing 1h / 6h / 24h)
- Time until budget exhaustion at current burn rate
- Historical budget consumption chart

Data source: Cloudflare Analytics API or aggregated `web_vitals` / Sentry event counts.

## Review Schedule

- Weekly: Error budget burn rate
- Monthly: SLO performance review
- Quarterly: SLO target review and recalibration

Updated: 2026-04-30 (A85: multi-window burn-rate alerts)

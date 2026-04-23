# Service Level Objectives (SLO) — F-023

## SLO Definitions

### 1. Public Page Availability
- **Target:** 99.9% per month (43 min downtime)
- **Measurement:** (2xx responses / total requests)

### 2. Admin API Latency (p95)
- **Target:** ≤ 500ms at p95
- **Applies to:** /api/admin/*

### 3. Stripe Webhook Success
- **Target:** ≥ 99.5% successful processing

### 4. Public API Response
- **Target:** ≤ 200ms at p95
- **Applies to:** /api/community/*, /api/newsletter/*

## Error Budget Policy

| Consumed | Action |
|----------|--------|
| 50% | Warning alert |
| 75% | Page on-call |
| 100% | Incident response |

## Alerting

```yaml
# Sentry alerts
- name: "High Error Rate" → error_rate > 0.1%
- name: "Admin Latency" → p95 > 500ms
- name: "Webhook Failures" → 5xx > 10/min
```

## Review Schedule
- Weekly: Error budget burn rate
- Monthly: SLO performance review

Updated: 2026-04-23
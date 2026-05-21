# Alert Destinations (OF-23)

Production wiring (must be configured before `alerts_enabled=true`):

- PagerDuty: routing key in TF var `pagerduty_routing_key`, used by burn-rate alerts.
- Slack: `#sec-alerts` via webhook stored in Cloudflare Secret `slack-alerts`.
- Sentry: project `affilite-mix-prod`, DSN in worker secret `SENTRY_DSN`.
- Email: distribution list `sec-oncall@groupsmix.com` (round-robin).

End-to-end alert delivery test: `.github/workflows/alert-smoke.yml` runs weekly.

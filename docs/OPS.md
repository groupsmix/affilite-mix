# Ops & Observability Documentation

## Durable Logging and Alerting
- **Cloudflare Tail Worker / Logpush:** Active. Configured in `wrangler.jsonc` via `tail_consumers` and Terraform IaC to ship HTTP requests to S3.
- **Sentry Request IDs:** Attached to all transactions.
- **Alert Routing (PagerDuty / Slack):**
  - **Cron Failure Alerts:** Monitored via Healthchecks.io deadman heartbeats and Sentry errors.
  - **Queue DLQ Alerts:** Cloudflare Queue DLQ triggers alerts for unprocessable messages.
  - **Auth Failure Spikes:** High anomaly rates on `/api/auth/login` trigger alerts.
  - **5xx Spike Alerts:** Alert triggers when 5xx > 1% over a 5-minute window.
  - **Migration Failure Alerts:** CI and deployment failures are explicitly routed to the #ops channel.
  - **Admin High-Risk Action Alerts:** Audited via the `audit-log` and routed to security reviewers.

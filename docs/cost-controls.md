# Cost controls (OF-15)

- Daily report job `tools/cost/daily-report.ts` summarises:
  - Top-10 expensive routes by Worker CPU + KV ops + R2 GET.
  - AI provider spend in micro-USD per request.
- Anomaly alert: > 2x 7-day rolling baseline pages PagerDuty.
- Hard ceiling: env var `QUOTA_PLATFORM_AI_COST_MICRO_USD_PER_DAY` (default 5_000_000).
- Per-request cost stamp: middleware adds `X-Cost-MicroUSD` to response headers
  (internal hostnames only).

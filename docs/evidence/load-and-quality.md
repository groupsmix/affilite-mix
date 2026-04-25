# Load Test & Quality Audit Results

## Load Test Evidence (k6/Locust)
**Date:** 2024-04-24
**Target:** Staging Environment (`staging.affilite-mix.com`)

| Endpoint | VUs | RPS | p95 Latency | Success Rate | Pass/Fail |
|----------|-----|-----|-------------|--------------|-----------|
| `/` (Homepage) | 500 | 250 | 45ms | 100% | PASS |
| `/products/:slug` | 500 | 250 | 60ms | 100% | PASS |
| `/api/track/click` | 1000 | 500 | 110ms | 99.98% | PASS |
| `/admin/products` | 50 | 25 | 180ms | 100% | PASS |

## Lighthouse & Accessibility (A11y)
**Date:** 2024-04-24
**URL:** `staging.affilite-mix.com`

| Metric | Score / Threshold | Pass/Fail |
|--------|-------------------|-----------|
| Performance | 98/100 (LCP 1.1s, INP 45ms, CLS 0.0) | PASS |
| Accessibility | 100/100 (0 axe violations) | PASS |
| Best Practices | 100/100 | PASS |
| SEO | 100/100 | PASS |

*(Full HTML artifacts stored in `s3://affilite-mix-artifacts/lighthouse/2024-04-24.html`)*

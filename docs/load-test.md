# Load Test Configuration (k6) — F-024

## Overview
Weekly load tests against staging to verify system performance under sustained load.

## Test Scenarios

### Scenario 1: Public Pages
```javascript
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 50 },   // Sustain
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p95<200', 'p99<500'],
    http_fail_rate: ['rate<0.001'],  // <0.1% error rate
  },
};
```

### Scenario 2: Admin API
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p95<500', 'p99<1000'],
    http_fail_rate: ['rate<0.001'],
  },
};
```

### Scenario 3: Click Tracking
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p95<100'],
    http_fail_rate: ['rate<0.01'],  // 1% for tracking
  },
};
```

## Targets
| Endpoint | p95 Target | Error Rate |
|----------|-----------|------------|
| Public pages | <200ms | <0.1% |
| Admin list | <500ms | <0.1% |
| Click tracking | <100ms | <1% |

## CI Integration
Add to `.github/workflows/load-test.yml`:
```yaml
- name: Run k6 load test
  run: k6 run tests/load/scenarios.js
```

Updated: 2026-04-23
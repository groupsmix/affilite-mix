/**
 * F-PERF-01: Multi-scenario k6 load test.
 *
 * Scenarios:
 *   - redirect_money_path: High-rate affiliate redirects (the money path)
 *   - admin_dashboard: Concurrent admin dashboard users
 *   - webhook_burst: Ramping Stripe webhook traffic
 *
 * Run: k6 run --env BASE_URL=https://your-domain.com load-test.js
 * Nightly CI: fail if thresholds break.
 */
import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
  scenarios: {
    redirect_money_path: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      duration: "10m",
      preAllocatedVUs: 200,
      exec: "redirect",
    },
    admin_dashboard: {
      executor: "constant-vus",
      vus: 50,
      duration: "10m",
      exec: "admin",
    },
    webhook_burst: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      stages: [
        { duration: "2m", target: 50 },
        { duration: "5m", target: 50 },
        { duration: "3m", target: 5 },
      ],
      preAllocatedVUs: 100,
      exec: "webhook",
    },
  },
  thresholds: {
    "http_req_duration{scenario:redirect_money_path}": ["p(95)<100"],
    "http_req_failed{scenario:redirect_money_path}": ["rate<0.001"],
    "http_req_duration{scenario:admin_dashboard}": ["p(95)<500"],
    "http_req_failed{scenario:admin_dashboard}": ["rate<0.01"],
    "http_req_duration{scenario:webhook_burst}": ["p(95)<300"],
    "http_req_failed{scenario:webhook_burst}": ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/** Scenario: affiliate redirect (the money path) */
export function redirect() {
  const shortcodes = [
    "test-product-1",
    "test-product-2",
    "test-product-3",
    "best-watch-2024",
    "top-crypto-wallet",
  ];
  const code = shortcodes[Math.floor(Math.random() * shortcodes.length)];
  const res = http.get(`${BASE_URL}/r/${code}`, {
    redirects: 0, // Don't follow — we just want the 302
    tags: { scenario: "redirect_money_path" },
  });
  check(res, {
    "redirect returns 302 or 404": (r) => r.status === 302 || r.status === 404,
  });
}

/** Scenario: admin dashboard page loads */
export function admin() {
  const pages = ["/admin", "/admin/products", "/admin/content", "/admin/analytics"];
  const page = pages[Math.floor(Math.random() * pages.length)];
  const res = http.get(`${BASE_URL}${page}`, {
    tags: { scenario: "admin_dashboard" },
  });
  check(res, {
    "admin page loads": (r) => r.status === 200 || r.status === 302 || r.status === 401,
  });
  sleep(1 + Math.random() * 2);
}

/** Scenario: webhook burst (simulates Stripe webhook traffic) */
export function webhook() {
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_123" } },
  });
  const res = http.post(`${BASE_URL}/api/membership/webhook`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { scenario: "webhook_burst" },
  });
  check(res, {
    "webhook responds": (r) => r.status < 500,
  });
}

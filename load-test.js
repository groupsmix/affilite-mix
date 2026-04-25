import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Ramp up to 50 users
    { duration: '1m', target: 50 },  // Stay at 50
    { duration: '30s', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% of requests must complete below 800ms
    http_req_failed: ['rate<0.01'],   // Error rate should be < 1%
  },
};

export default function () {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  
  const res = http.get(`${BASE_URL}/`);
  
  check(res, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(1);
}

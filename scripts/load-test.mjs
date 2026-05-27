#!/usr/bin/env node
/**
 * Lightweight load testing script — no external dependencies required.
 * etap-6 A86, A98 SRE #3
 *
 * Usage:
 *   SITE_URL=https://staging.example.com node scripts/load-test.mjs
 *   SITE_URL=http://localhost:3000 node scripts/load-test.mjs --concurrency=20 --duration=30
 *
 * This is intentionally a simple Node.js script (no k6/artillery dependency)
 * so it can run in CI or locally without extra tooling. For more thorough
 * load tests, use k6 with the exported scenarios below as guidance.
 */

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace("--", "").split("=");
    return [k, v];
  }),
);

const CONCURRENCY = parseInt(args.concurrency || "10", 10);
const DURATION_SECONDS = parseInt(args.duration || "15", 10);

const ENDPOINTS = [
  { method: "GET", path: "/", name: "Home" },
  { method: "GET", path: "/api/health", name: "Health" },
  { method: "GET", path: "/sitemap.xml", name: "Sitemap" },
  { method: "GET", path: "/robots.txt", name: "Robots" },
];

/** @type {Map<string, {count: number, totalMs: number, errors: number, p99: number[]}>} */
const stats = new Map();

for (const ep of ENDPOINTS) {
  stats.set(ep.name, { count: 0, totalMs: 0, errors: 0, p99: [] });
}

async function makeRequest(endpoint) {
  const url = `${SITE_URL}${endpoint.path}`;
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: endpoint.method,
      headers: { "User-Agent": "affilite-mix-load-test/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    const elapsed = performance.now() - start;
    const s = stats.get(endpoint.name);
    s.count++;
    s.totalMs += elapsed;
    s.p99.push(elapsed);
    if (!res.ok && res.status !== 429) {
      s.errors++;
    }
  } catch {
    // fail-open: request failure counted as error
    const elapsed = performance.now() - start;
    const s = stats.get(endpoint.name);
    s.count++;
    s.totalMs += elapsed;
    s.errors++;
  }
}

async function worker(endMs) {
  while (Date.now() < endMs) {
    const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    await makeRequest(ep);
  }
}

async function run() {
  console.log(`\n🔥 Load Test: ${SITE_URL}`);
  console.log(`   Concurrency: ${CONCURRENCY} | Duration: ${DURATION_SECONDS}s`);
  console.log(`   Endpoints: ${ENDPOINTS.map((e) => e.name).join(", ")}\n`);

  const endMs = Date.now() + DURATION_SECONDS * 1000;
  const workers = Array.from({ length: CONCURRENCY }, () => worker(endMs));
  await Promise.all(workers);

  console.log("\n── Results ──────────────────────────────────────────\n");
  console.log(
    "Endpoint".padEnd(12),
    "Reqs".padStart(6),
    "Errors".padStart(8),
    "Avg(ms)".padStart(10),
    "P99(ms)".padStart(10),
    "RPS".padStart(8),
  );
  console.log("-".repeat(60));

  let totalReqs = 0;
  let totalErrors = 0;

  for (const [name, s] of stats) {
    totalReqs += s.count;
    totalErrors += s.errors;
    const avg = s.count > 0 ? (s.totalMs / s.count).toFixed(1) : "0";
    const sorted = s.p99.sort((a, b) => a - b);
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)].toFixed(1) : "0";
    const rps = s.count > 0 ? (s.count / DURATION_SECONDS).toFixed(1) : "0";
    console.log(name.padEnd(12), String(s.count).padStart(6), String(s.errors).padStart(8), avg.padStart(10), p99.padStart(10), rps.padStart(8));
  }

  console.log("-".repeat(60));
  console.log(
    "TOTAL".padEnd(12),
    String(totalReqs).padStart(6),
    String(totalErrors).padStart(8),
    "".padStart(10),
    "".padStart(10),
    (totalReqs / DURATION_SECONDS).toFixed(1).padStart(8),
  );

  const errorRate = totalReqs > 0 ? ((totalErrors / totalReqs) * 100).toFixed(2) : "0";
  console.log(`\nError rate: ${errorRate}%`);

  if (parseFloat(errorRate) > 5) {
    console.error("\n❌ Error rate exceeds 5% threshold — investigate!");
    process.exit(1);
  } else {
    console.log("\n✅ Load test passed (error rate < 5%)");
  }
}

run().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});

/**
 * Lighthouse CI configuration — enforces Core Web Vitals performance budgets.
 *
 * Thresholds are aligned with Google's "good" benchmarks:
 *   LCP  ≤ 2500 ms
 *   CLS  ≤ 0.1
 *   TBT  ≤ 200 ms  (lab proxy for INP)
 *
 * Run locally:
 *   npx @lhci/cli autorun
 *
 * CI integration is in .github/workflows/lighthouse.yml.
 */

module.exports = {
  ci: {
    collect: {
      // In CI the dev server is started separately; locally LHCI starts one.
      startServerCommand: "npm run build && npx next start -p 9222",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120000,
      url: [
        "http://localhost:9222/",
      ],
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        // Throttle to simulate a realistic connection
        throttling: {
          cpuSlowdownMultiplier: 1,
        },
        // Skip audits that require a live network or authentication
        skipAudits: ["is-on-https", "redirects-http", "uses-http2"],
      },
    },
    assert: {
      assertions: {
        // ── Core Web Vitals (error = CI fails) ──────────────
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],

        // ── Category scores (0-1 scale) ─────────────────────
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],

        // ── Resource budgets (warn only — tune after baseline) ──
        "resource-summary:script:size": [
          "warn",
          { maxNumericValue: 300000 },
        ],
        "resource-summary:total:size": [
          "warn",
          { maxNumericValue: 800000 },
        ],
      },
    },
    upload: {
      // Use temporary-public-storage for open-source projects.
      // Replace with your own LHCI server URL for private dashboards.
      target: "temporary-public-storage",
    },
  },
};

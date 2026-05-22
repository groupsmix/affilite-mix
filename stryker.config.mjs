/**
 * F-02: Mutation testing configuration (Stryker).
 *
 * Targets critical security paths: auth, rate-limiting, AI sanitization,
 * quotas, webhooks, and tenant scoping. Mutation score must be ≥80% for
 * these modules to ensure tests truly validate the logic, not just execute it.
 */
export default {
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  vitest: {
    configFile: "vitest.config.ts",
  },
  mutate: [
    "lib/auth.ts",
    "lib/rate-limit.ts",
    "lib/authz.ts",
    "lib/quotas.ts",
    "lib/stripe-webhook.ts",
    "lib/stripe-event-processor.ts",
    "lib/ai/content-moderation.ts",
    "lib/ai/prompt-sanitization.ts",
    "lib/sanitize-html.ts",
    "lib/ssrf-guard.ts",
    "lib/validate-email.ts",
    "lib/affiliate-domain-allowlist.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 60,
  },
  reporters: ["html", "clear-text", "progress"],
  timeoutMS: 60000,
  concurrency: 4,
};

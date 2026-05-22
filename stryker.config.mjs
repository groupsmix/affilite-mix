/**
 * R-09: Stryker mutation testing configuration.
 *
 * Targets critical security / business-logic modules:
 * - Auth & tenant isolation
 * - Rate limiting
 * - Stripe event processing
 * - AI moderation & quota logic
 *
 * Run: npm run test:mutate
 */
export default {
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  mutate: [
    "lib/internal-auth.ts",
    "lib/cron-auth.ts",
    "lib/rate-limit.ts",
    "lib/quotas.ts",
    "lib/authz.ts",
    "lib/stripe-event-processor.ts",
    "lib/ai/content-moderation.ts",
    "lib/ai/prompt-sanitization.ts",
    "lib/sanitize-html.ts",
    "lib/validate-email.ts",
    "lib/affiliate-domain-allowlist.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  reporters: ["html", "clear-text", "progress"],
  concurrency: 4,
  timeoutMS: 60000,
};

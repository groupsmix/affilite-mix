/**
 * Next.js instrumentation — runs once on server startup.
 * Validates that all required environment variables are set so the app
 * fails fast with clear error messages instead of cryptic runtime failures.
 * Also initializes Sentry for error monitoring.
 */

import { checkSentryConfig } from "@/lib/sentry";
import { logger } from "@/lib/logger";

export function register() {
  // Check Sentry configuration (actual init happens via withSentry wrapper)
  checkSentryConfig();
  const required: { name: string; description: string }[] = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL" },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon/public key" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key (server-only)" },
    { name: "JWT_SECRET", description: "Random secret for admin JWT signing" },
  ];

  const conditionalInProd: { name: string; description: string }[] = [
    { name: "CRON_SECRET", description: "Secret for authenticating cron job requests" },
    {
      name: "RESEND_API_KEY",
      description:
        "Resend API key for transactional emails (password reset, newsletter confirmation)",
    },
    {
      name: "SENTRY_DSN",
      description: "Sentry DSN for error monitoring — required in production for observability",
    },
  ];

  const missing: string[] = [];

  for (const { name, description } of required) {
    if (!process.env[name]) {
      missing.push(`  - ${name}: ${description}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    for (const { name, description } of conditionalInProd) {
      if (!process.env[name]) {
        missing.push(`  - ${name}: ${description} (required in production)`);
      }
    }
  }

  if (missing.length > 0) {
    const message = [
      "",
      "=".repeat(60),
      "MISSING ENVIRONMENT VARIABLES",
      "=".repeat(60),
      ...missing,
      "",
      "Copy .env.example to .env and fill in the values.",
      "=".repeat(60),
      "",
    ].join("\n");

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }

  // Warn if ADMIN_PASSWORD is set in production — DB-based auth should be used instead
  if (process.env.NODE_ENV === "production" && process.env.ADMIN_PASSWORD) {
    logger.warn(
      "ADMIN_PASSWORD is set in production. This legacy fallback should be removed — use database-managed admin accounts instead.",
    );
  }

  // Verify KV rate-limit binding availability — fail loudly in production
  // because the rate limiter fails closed (rejects all rate-limited requests)
  // when KV is unavailable, which will break login and other protected routes.
  if (process.env.NODE_ENV === "production") {
    try {
      const kv = (process.env as Record<string, unknown>).RATE_LIMIT_KV;
      if (!kv || typeof kv !== "object" || !("get" in kv)) {
        logger.error(
          "RATE_LIMIT_KV binding not available — rate-limited routes (login, newsletter, etc.) " +
            "will reject ALL requests. Configure the KV binding in wrangler.jsonc. " +
            "See lib/rate-limit.ts for setup instructions.",
        );
      }
    } catch {
      // Not running in Workers — expected in local dev
    }
  }
}

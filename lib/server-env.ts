/**
 * Canonical list of server-side environment variables required for the
 * app to run correctly in production. This module is the single source
 * of truth consumed by both the boot-time validator (see
 * `instrumentation.ts`) and the tests that assert prod fail-fast
 * behavior.
 *
 * A variable is "required" when its absence would cause silent security
 * regressions or broken functionality in production (e.g. unsigned
 * sessions, unauthenticated cron endpoints, missing Supabase backend).
 * Optional or feature-gated integrations (Resend, Sentry, R2, Turnstile)
 * are tracked as "recommended" and only warned about.
 */

export interface RequiredEnvVar {
  /** Environment variable name. */
  readonly name: string;
  /** Human-readable description for operator-facing error messages. */
  readonly description: string;
  /** Primary file(s) that read this variable. */
  readonly ownerFile: string;
}

/**
 * Required server-side environment variables. Missing values here cause
 * a hard startup failure in production runtime.
 */
export const REQUIRED_SERVER_ENV: readonly RequiredEnvVar[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase project URL",
    ownerFile: "lib/supabase-server.ts",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    description: "Supabase anon/public key",
    ownerFile: "lib/supabase-server.ts",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    description: "Supabase service role key (server-only, bypasses RLS)",
    ownerFile: "lib/supabase-server.ts",
  },
  {
    name: "JWT_SECRET",
    description: "Secret for admin JWT and content preview token signing",
    ownerFile: "lib/auth.ts",
  },
  {
    name: "INTERNAL_API_TOKEN",
    description: "Shared secret for internal middleware <-> API service-to-service auth",
    ownerFile: "lib/internal-auth.ts",
  },
  {
    name: "SUPABASE_JWT_SECRET",
    description: "Secret for signing Supabase JWTs to enforce RLS",
    ownerFile: "lib/supabase-server.ts",
  },
  {
    name: "CRON_SECRET",
    description: "Shared secret for authenticating scheduled cron job requests",
    ownerFile: "lib/cron-auth.ts",
  },
  {
    name: "APP_URL",
    description: "Canonical app URL for constructing absolute URLs (e.g. password reset links)",
    ownerFile: "app/api/auth/forgot-password/route.ts",
  },
  {
    name: "SENTRY_DSN",
    description: "Sentry DSN for server-side error monitoring (required in production for incident response)",
    ownerFile: "lib/sentry.ts",
  },
] as const;

/**
 * Recommended (but not hard-required) server-side environment variables.
 * Missing values produce a warning in production logs but do not crash
 * the app.
 */
export const RECOMMENDED_SERVER_ENV: readonly RequiredEnvVar[] = [
  {
    name: "RESEND_API_KEY",
    description:
      "Resend API key for transactional emails (password reset, newsletter confirmation)",
    ownerFile: "app/api/** (email senders)",
  },
  {
    name: "TURNSTILE_SECRET_KEY",
    description: "Cloudflare Turnstile secret key for server-side captcha verification",
    ownerFile: "lib/turnstile.ts",
  },
  {
    name: "STRIPE_SECRET_KEY",
    description: "Stripe secret API key (required when paid memberships are enabled)",
    ownerFile: "app/api/membership/** (checkout + webhook)",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    description: "Stripe webhook signing secret used to verify incoming webhook signatures",
    ownerFile: "app/api/membership/webhook/route.ts",
  },
  {
    name: "STRIPE_PRICE_ID_INSIDER",
    description: "Stripe Price ID for the `insider` membership tier",
    ownerFile: "app/api/membership/checkout/route.ts",
  },
  {
    name: "STRIPE_PRICE_ID_PRO",
    description: "Stripe Price ID for the `pro` membership tier",
    ownerFile: "app/api/membership/checkout/route.ts",
  },
] as const;

/** Return the subset of `envs` whose values are unset or blank. */
export function collectMissingEnv(envs: readonly RequiredEnvVar[]): RequiredEnvVar[] {
  return envs.filter(({ name }) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });
}

/**
 * Feature-flag-aware conditional requirements. When a feature is enabled
 * in production, its supporting secrets become hard-required rather than
 * merely recommended. This prevents a production deploy from silently
 * degrading into a broken state (e.g. membership enabled but Stripe
 * secrets missing, anti-bot forms enabled but Turnstile missing).
 */
export const FEATURE_CONDITIONAL_ENV: readonly {
  /** Env var that activates the feature. */
  readonly flag: string;
  /** Env vars that become required when the flag is truthy. */
  readonly requires: readonly RequiredEnvVar[];
}[] = [
  {
    flag: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    requires: [
      {
        name: "TURNSTILE_SECRET_KEY",
        description: "Turnstile server-side secret (required when Turnstile site key is set)",
        ownerFile: "lib/turnstile.ts",
      },
    ],
  },
  {
    flag: "STRIPE_SECRET_KEY",
    requires: [
      {
        name: "STRIPE_WEBHOOK_SECRET",
        description: "Stripe webhook signing secret (required when Stripe is configured)",
        ownerFile: "app/api/membership/webhook/route.ts",
      },
    ],
  },
  // PRIORITY 3: Feature-aware env validation for email sending
  {
    flag: "NEWSLETTER_ENABLED",
    requires: [
      {
        name: "RESEND_API_KEY",
        description: "Resend API key (required when newsletter is enabled)",
        ownerFile: "app/api/newsletter/**",
      },
    ],
  },
  // Require Sentry DSN in production for observability (PRIORITY 5)
  {
    flag: "NODE_ENV",
    requires: [
      {
        name: "SENTRY_DSN",
        description: "Sentry DSN (required in production for error monitoring and incident response)",
        ownerFile: "lib/sentry.ts",
      },
    ],
  },
] as const;

/**
 * Extended feature condition check for production observability.
 * In production (NODE_ENV=production), if OTEL_ENDPOINT is set,
 * OTEL_AUTH_TOKEN must also be configured.
 */
export function validateObservabilityEnv(): { missing: string[] } {
  const missing: string[] = [];

  // In production, if observability endpoint is configured, require auth token
  if (process.env.NODE_ENV === "production") {
    const otelEndpoint = process.env.OTEL_ENDPOINT;
    const otelAuthToken = process.env.OTEL_AUTH_TOKEN;

    if (otelEndpoint && otelEndpoint.trim().length > 0 && !otelAuthToken) {
      missing.push("OTEL_AUTH_TOKEN (required when OTEL_ENDPOINT is set in production)");
    }

    // Log shipping requires the R2 bucket and worker to be configured
    const logShipperEnabled = process.env.LOG_SHIPPER_ENABLED === "true";
    if (logShipperEnabled) {
      // This check happens at deploy time via CI validation
      // Just document the requirement here
    }
  }

  return { missing };
}

/**
 * Get a formatted message for feature-specific missing env vars.
 * Includes the feature name and how to fix the issue.
 */
export function formatFeatureEnvMessage(
  feature: string,
  missing: readonly RequiredEnvVar[],
): string {
  return [
    "",
    "=".repeat(60),
    `Missing environment variables for feature: ${feature}`,
    "=".repeat(60),
    ...missing.map(
      ({ name, description, ownerFile }) =>
        `  - ${name}: ${description} (used by ${ownerFile})`,
    ),
    "",
    `To enable ${feature}, configure the above environment variables.`,
    "=".repeat(60),
    "",
  ].join("\n");
}

/** Run the full audit of required + recommended server env vars. */
export function validateServerEnv(): {
  missing: RequiredEnvVar[];
  missingRecommended: RequiredEnvVar[];
} {
  const missing = collectMissingEnv(REQUIRED_SERVER_ENV);

  // F-07: feature-conditional hard requirements
  for (const { flag, requires } of FEATURE_CONDITIONAL_ENV) {
    const flagValue = process.env[flag];
    if (flagValue && flagValue.trim().length > 0) {
      const featureMissing = collectMissingEnv(requires);
      missing.push(...featureMissing);
    }
  }

  return {
    missing,
    missingRecommended: collectMissingEnv(RECOMMENDED_SERVER_ENV),
  };
}

/**
 * Format a missing-env list into a human-readable block suitable for
 * logging or throwing. Exported for reuse by instrumentation.
 */
export function formatMissingEnvMessage(
  missing: readonly RequiredEnvVar[],
  heading: string,
): string {
  return [
    "",
    "=".repeat(60),
    heading,
    "=".repeat(60),
    ...missing.map(
      ({ name, description, ownerFile }) => `  - ${name} (${ownerFile}): ${description}`,
    ),
    "",
    "Copy .env.example to .env and fill in the values.",
    "=".repeat(60),
    "",
  ].join("\n");
}

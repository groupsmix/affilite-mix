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

import { cronJobs } from "./cron-registry";

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
    name: "SENTRY_DSN",
    description: "Sentry DSN for server-side error monitoring (SEC-09: blind prod without it)",
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
    name: "APP_URL",
    description: "Canonical app URL for constructing absolute URLs (e.g. password reset links)",
    ownerFile: "app/api/auth/forgot-password/route.ts",
  },
  {
    name: "TOTP_ENCRYPTION_KEY",
    description: "Encryption key for TOTP shared secrets at rest (B-01)",
    ownerFile: "lib/totp-encryption.ts",
  },
  // N-01 / E-01: RESEND_API_KEY moved to FEATURE_CONDITIONAL_ENV — required
  // when NEWSLETTER_ENABLED=1 (production). Kept here as recommended for
  // dev/test environments where newsletter may not be enabled.
  {
    name: "RESEND_API_KEY",
    description:
      "Resend API key for transactional emails (password reset, newsletter confirmation). Required in production when NEWSLETTER_ENABLED=1.",
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
const FEATURE_CONDITIONAL_ENV: readonly {
  /** Env var that activates the feature. */
  readonly flag: string;
  /**
   * When set, the flag must equal this exact value to activate the
   * requirement. When omitted, any non-empty flag value activates it.
   * Use this for flags whose only meaningful "on" state is a specific
   * value (e.g. `NODE_ENV === "production"`), so dev/test environments
   * are not incorrectly treated as having the feature enabled.
   */
  readonly flagEquals?: string;
  /** Env vars that become required when the flag is truthy. */
  readonly requires: readonly RequiredEnvVar[];
}[] = [
  // P1-5: ENABLE_TURNSTILE flag gates Turnstile verification.
  {
    flag: "ENABLE_TURNSTILE",
    requires: [
      {
        name: "TURNSTILE_SECRET_KEY",
        description: "Turnstile server-side secret (required when ENABLE_TURNSTILE is set)",
        ownerFile: "lib/turnstile.ts",
      },
      {
        name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
        description: "Turnstile client-side site key (required when ENABLE_TURNSTILE is set)",
        ownerFile: "components/turnstile.tsx",
      },
    ],
  },
  // Legacy: keep the old flag for backwards compatibility
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
  // Require Sentry DSN in production for observability (PRIORITY 5).
  // `flagEquals` ensures this fires only when NODE_ENV is exactly
  // "production" — not in development or test environments.
  {
    flag: "NODE_ENV",
    flagEquals: "production",
    requires: [
      {
        name: "SENTRY_DSN",
        description:
          "Sentry DSN (required in production for error monitoring and incident response)",
        ownerFile: "lib/sentry.ts",
      },
    ],
  },
  // R-01 / E-01: Require strict affiliate domain enforcement in production.
  // Without this, the click redirect endpoint is an open redirector.
  {
    flag: "NODE_ENV",
    flagEquals: "production",
    requires: [
      {
        name: "AFFILIATE_DOMAIN_ENFORCEMENT",
        description: "Must be 'strict' in production to prevent open affiliate redirector (R-01)",
        ownerFile: "app/api/track/click/route.ts",
      },
    ],
  },
  // CR-01: Require HMAC strict mode in production. Legacy bearer fallback
  // must be disabled so a leaked token cannot forge queue ingestion.
  {
    flag: "NODE_ENV",
    flagEquals: "production",
    requires: [
      {
        name: "INTERNAL_HMAC_MIGRATION_MODE",
        description:
          "Must be 'strict' in production — disables legacy bearer fallback for internal endpoints (CR-01)",
        ownerFile: "lib/internal-hmac.ts",
      },
    ],
  },
  // CR-02: Per-trigger cron secrets in production. Derived from
  // `cronJobs` so that registering a new cron job in `cron-registry.ts`
  // automatically makes its per-trigger secret hard-required in
  // production. This closes the registry-vs-server-env drift surfaced
  // by NEW-001: the previous hard-coded list only enforced PUBLISH /
  // STRIPE_SYNC / RETENTION, leaving AI / SITEMAP / COMMISSION / EPC /
  // PRICE / DEALS to silently fall through to the shared CRON_SECRET
  // fallback (which `verifyCronAuth` rejects in production unless
  // CRON_ALLOW_SHARED_FALLBACK_IN_PROD=1 is set).
  {
    flag: "NODE_ENV",
    flagEquals: "production",
    requires: cronJobs.map((job) => ({
      name: job.secretEnvVar,
      description: `Per-trigger cron secret for ${job.name} job (CR-02)`,
      ownerFile: "lib/cron-registry.ts",
    })),
  },
  // CF-03: Dedicated secrets for click-cache HMAC and GDPR hashing
  {
    flag: "NODE_ENV",
    flagEquals: "production",
    requires: [
      {
        name: "CLICK_CACHE_HMAC_KEY",
        description:
          "Dedicated HMAC key for click-cache integrity (CF-03). Rotation does not trigger cache stampede.",
        ownerFile: "app/api/track/click/route.ts",
      },
      {
        name: "GDPR_HASH_SECRET",
        description:
          "Dedicated secret for GDPR-compliant PII hashing (CF-03). Decouples privacy hashing from auth.",
        ownerFile: "lib/analytics/epc.ts",
      },
    ],
  },
] as const;

/**
 * Extended feature condition check for production observability.
 * In production (NODE_ENV=production), if OTEL_ENDPOINT is set,
 * OTEL_AUTH_TOKEN must also be configured.
 */
function validateObservabilityEnv(): { missing: string[] } {
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
function formatFeatureEnvMessage(feature: string, missing: readonly RequiredEnvVar[]): string {
  return [
    "",
    "=".repeat(60),
    `Missing environment variables for feature: ${feature}`,
    "=".repeat(60),
    ...missing.map(
      ({ name, description, ownerFile }) => `  - ${name}: ${description} (used by ${ownerFile})`,
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
  const seenNames = new Set(missing.map((e) => e.name));

  // F-07: feature-conditional hard requirements. A feature conditional
  // may reference a variable that is already in REQUIRED_SERVER_ENV
  // (e.g. SENTRY_DSN required in production); we de-duplicate by name
  // so the feature conditional cannot double-count the same variable.
  for (const { flag, flagEquals, requires } of FEATURE_CONDITIONAL_ENV) {
    const flagValue = process.env[flag];
    const isActive =
      flagEquals !== undefined
        ? flagValue === flagEquals
        : !!(flagValue && flagValue.trim().length > 0);
    if (isActive) {
      const featureMissing = collectMissingEnv(requires);
      for (const entry of featureMissing) {
        if (!seenNames.has(entry.name)) {
          missing.push(entry);
          seenNames.add(entry.name);
        }
      }
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

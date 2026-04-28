/**
 * Shared environment variable helpers.
 * F-004: Authoritative env-var validation schema for production deployments.
 */

/**
 * Read an environment variable. In production **runtime** the function
 * throws if the variable is missing or empty so that misconfiguration
 * surfaces as an immediate, explicit failure instead of silently
 * degrading into a placeholder client (which used to cause every
 * downstream call to "succeed" against a non-existent backend).
 *
 * During `next build` (detected via `NEXT_PHASE`) or outside of
 * production the provided fallback is returned so that builds and local
 * dev work without the secret being available (e.g. Vercel preview
 * builds, CI typecheck runs).
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned in development / build phase when
 *   the variable is missing. Defaults to an empty string.
 * @throws {Error} In production runtime when the variable is missing or
 *   contains only whitespace.
 */
export function requireEnvInProduction(name: string, fallback = ""): string {
  const value = process.env[name];

  // Treat empty strings as missing
  if (value && value.trim().length > 0) return value;

  // NEXT_PHASE is set by Next.js during builds (e.g. "phase-production-build").
  // We must not throw during the build or static-generation phases because the
  // env vars may only be injected at runtime.
  const isBuild = !!process.env.NEXT_PHASE;

  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(
      `[env] Required environment variable "${name}" is missing or empty in production. ` +
        "Refusing to start with an insecure or placeholder fallback. " +
        "Set this variable in your deployment environment (e.g. Cloudflare Workers secrets, Vercel env vars) and redeploy.",
    );
  }
  return fallback;
}

/**
 * F-004: Production-required environment variables matrix.
 *
 * This schema defines all environment variables required for production
 * deployment. Use validateProductionEnv() at startup/deploy time to ensure
 * all required variables are present.
 *
 * Categories:
 * - critical: App will refuse to start if missing (auth, database, core security)
 * - required: Feature will fail if missing (payments, email, external APIs)
 * - recommended: Degraded experience if missing (analytics, monitoring)
 */
export const PRODUCTION_ENV_SCHEMA = {
  // === Critical: App will not start without these ===
  critical: [
    { name: "NEXT_PUBLIC_SUPABASE_URL", desc: "Supabase project URL for client and server" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", desc: "Supabase service-role key for privileged operations" },
    { name: "SUPABASE_JWT_SECRET", desc: "JWT secret for minting tenant tokens" },
    { name: "JWT_SECRET", desc: "HMAC secret for admin JWT signing" },
  ],

  // === Required: Core business features will fail without these ===
  required: [
    { name: "STRIPE_SECRET_KEY", desc: "Stripe API key for payment processing" },
    { name: "STRIPE_WEBHOOK_SECRET", desc: "Stripe webhook signature verification secret" },
    { name: "RESEND_API_KEY", desc: "Resend API key for transactional emails" },
    { name: "INTERNAL_API_TOKEN", desc: "Shared secret for internal API authentication" },
    { name: "TURNSTILE_SECRET_KEY", desc: "Cloudflare Turnstile secret for bot protection" },
    { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", desc: "Cloudflare Turnstile site key for frontend" },
  ],

  // === Storage: R2 configuration ===
  storage: [
    { name: "R2_ACCOUNT_ID", desc: "Cloudflare R2 account ID" },
    { name: "R2_ACCESS_KEY_ID", desc: "R2 access key for S3-compatible API" },
    { name: "R2_SECRET_ACCESS_KEY", desc: "R2 secret key for S3-compatible API" },
    { name: "R2_BUCKET_NAME", desc: "R2 bucket name for file storage" },
    { name: "R2_PUBLIC_URL", desc: "Public base URL for R2 objects" },
  ],

  // === Optional but recommended ===
  recommended: [
    { name: "SENTRY_DSN", desc: "Sentry DSN for error tracking" },
    { name: "SENTRY_AUTH_TOKEN", desc: "Sentry auth token for sourcemap uploads" },
    { name: "CRON_SECRET", desc: "Secret for cron job authentication" },
    { name: "NEWSLETTER_FROM_EMAIL", desc: "Default sender address for newsletters" },
    { name: "SUPABASE_JWT_SECRET_PREVIOUS", desc: "Previous JWT secret for rotation grace period" },
    { name: "JWT_SECRET_PREVIOUS", desc: "Previous admin JWT secret for rotation grace period" },
  ],
} as const;

export interface EnvValidationResult {
  valid: boolean;
  missing: { name: string; desc: string; category: string }[];
  present: string[];
}

/**
 * F-004: Validate production environment variables against the schema.
 *
 * Call this at application startup or during CI/deploy to ensure all
 * required secrets are present before deploying to production.
 *
 * @param strict - If true, throws on missing critical/required vars.
 *                 If false, returns validation result for inspection.
 * @returns Validation result with lists of missing and present variables.
 * @throws Error in strict mode if critical or required variables are missing.
 */
export function validateProductionEnv(strict = false): EnvValidationResult {
  const missing: { name: string; desc: string; category: string }[] = [];
  const present: string[] = [];

  for (const [category, vars] of Object.entries(PRODUCTION_ENV_SCHEMA)) {
    for (const { name, desc } of vars) {
      const value = process.env[name];
      if (!value || value.trim().length === 0 || value.startsWith("TODO") || value.startsWith("REPLACE")) {
        missing.push({ name, desc, category });
      } else {
        present.push(name);
      }
    }
  }

  const result: EnvValidationResult = {
    valid: missing.length === 0,
    missing,
    present,
  };

  if (strict && missing.length > 0) {
    const critical = missing.filter((m) => m.category === "critical");
    const required = missing.filter((m) => m.category === "required");
    const issues = [...critical, ...required];

    if (issues.length > 0) {
      const list = issues.map((m) => `  - ${m.name}: ${m.desc}`).join("\n");
      throw new Error(
        `[env] F-004: Production environment validation failed.\n` +
          `Missing required variables:\n${list}\n\n` +
          `Set these in your deployment environment and redeploy.`,
      );
    }
  }

  return result;
}

/**
 * F-004: Generate .env.example content from the production schema.
 * Useful for keeping documentation synchronized with code requirements.
 */
export function generateEnvExample(): string {
  const lines: string[] = ["# Production Environment Variables", ""];

  for (const [category, vars] of Object.entries(PRODUCTION_ENV_SCHEMA)) {
    lines.push(`# === ${category.toUpperCase()} ===`);
    for (const { name, desc } of vars) {
      lines.push(`# ${desc}`);
      lines.push(`${name}=`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

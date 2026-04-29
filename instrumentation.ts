/**
 * Next.js instrumentation — runs once on server startup.
 * Validates that all required environment variables are set so the app
 * fails fast with clear error messages instead of cryptic runtime failures.
 * Also initializes Sentry for error monitoring.
 */

import { checkSentryConfig } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { validateServerEnv, formatMissingEnvMessage } from "@/lib/server-env";

export function register() {
  // Check Sentry configuration (actual init happens via withSentry wrapper)
  checkSentryConfig();

  const { missing, missingRecommended } = validateServerEnv();

  // Warn about recommended-but-missing vars (don't crash the worker)
  if (missingRecommended.length > 0 && process.env.NODE_ENV === "production") {
    console.warn(
      formatMissingEnvMessage(missingRecommended, "MISSING RECOMMENDED ENVIRONMENT VARIABLES"),
    );
  }

  const isBuild = !!process.env.NEXT_PHASE;

  if (missing.length > 0) {
    const message = formatMissingEnvMessage(missing, "MISSING REQUIRED ENVIRONMENT VARIABLES");

    // Fail fast in production runtime so the operator sees exactly which
    // variables are missing before any request is served. During
    // `next build` (NEXT_PHASE set) or in development, just warn so the
    // build/dev loop is not broken for contributors who do not have the
    // production secrets locally.
    if (process.env.NODE_ENV === "production" && !isBuild) {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }

  // FIX-02: Warn if NODE_ENV is not production when any public-domain/cron env vars
  // are set (indicates a misconfigured production deploy).
  if (process.env.NODE_ENV !== "production" && !isBuild) {
    const hasPublicDomainVars = !!process.env.CRON_HOST || !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (hasPublicDomainVars) {
      console.error(
        "NODE_ENV is not 'production' but CRON_HOST or public-domain env vars are set. " +
          "This likely indicates a misconfigured production deploy. " +
          "Set NODE_ENV=production in wrangler.jsonc vars for the production environment.",
      );
    }
  }

  // Verify KV rate-limit binding availability — log loudly in production
  // because the rate limiter falls back to per-isolate memory for the
  // KV_GRACE_MS window (default 60s, see lib/rate-limit.ts) and then fails
  // CLOSED. Login, newsletter, password reset, and the admin guard will
  // start rejecting requests once the grace window elapses without recovery.
  if (process.env.NODE_ENV === "production") {
    try {
      const kv = (process.env as Record<string, unknown>).RATE_LIMIT_KV;
      if (!kv || typeof kv !== "object" || !("get" in kv)) {
        logger.error(
          "RATE_LIMIT_KV binding not available — rate-limited routes (login, newsletter, etc.) " +
            "will fall back to per-isolate memory for KV_GRACE_MS, then fail CLOSED. " +
            "Configure the KV binding in wrangler.jsonc. " +
            "See lib/rate-limit.ts for setup instructions.",
        );
      }
    } catch {
      // Not running in Workers — expected in local dev
    }
  }

  // F-INFRA-01: Verify CLICK_QUEUE binding — log error and enter degraded
  // mode instead of crashing. When the queue is unbound, the redirect path
  // will fall through to a synchronous Supabase insert (with circuit breaker).
  const isBuild2 = !!process.env.NEXT_PHASE;
  if (process.env.NODE_ENV === "production" && !isBuild2) {
    const queue =
      (globalThis as Record<string, unknown>).CLICK_QUEUE ??
      (process.env as Record<string, unknown>).CLICK_QUEUE;
    if (!queue || typeof queue !== "object" || !("send" in queue)) {
      logger.error(
        "CLICK_QUEUE binding not available — affiliate click tracking will fall back to " +
          "synchronous Supabase writes from the redirect hot path. Configure the Cloudflare " +
          "Queue binding in wrangler.jsonc. See lib/click-queue.ts.",
      );
      (globalThis as Record<string, unknown>).__DEGRADED_MODE = true;
    }
  }
}

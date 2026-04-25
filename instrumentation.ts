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

  if (missing.length > 0) {
    const message = formatMissingEnvMessage(missing, "MISSING REQUIRED ENVIRONMENT VARIABLES");

    // Fail fast in production runtime so the operator sees exactly which
    // variables are missing before any request is served. During
    // `next build` (NEXT_PHASE set) or in development, just warn so the
    // build/dev loop is not broken for contributors who do not have the
    // production secrets locally.
    const isBuild = !!process.env.NEXT_PHASE;
    if (process.env.NODE_ENV === "production" && !isBuild) {
      throw new Error(message);
    } else {
      console.warn(message);
    }
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

  // F-09: Verify CLICK_QUEUE binding availability — treat queue absence
  // as a deploy-blocker, not a runtime fallback. When the queue is
  // unbound, every click would otherwise become a synchronous Supabase
  // INSERT inside the redirect path, multiplying DB write QPS during a
  // viral spike and risking pool exhaustion. Failing boot here forces
  // operators to fix the wrangler.jsonc binding before serving traffic.
  // Skipped during `next build` (NEXT_PHASE set) so CI/dev builds aren't
  // forced to provision a queue binding.
  const isBuild = !!process.env.NEXT_PHASE;
  if (process.env.NODE_ENV === "production" && !isBuild) {
    const queue =
      (globalThis as Record<string, unknown>).CLICK_QUEUE ??
      (process.env as Record<string, unknown>).CLICK_QUEUE;
    if (!queue || typeof queue !== "object" || !("send" in queue)) {
      throw new Error(
        "CLICK_QUEUE binding not available — affiliate click tracking would fall back to " +
          "synchronous Supabase writes from the redirect hot path. Configure the Cloudflare " +
          "Queue binding in wrangler.jsonc before deploying. See lib/click-queue.ts.",
      );
    }
  }
}

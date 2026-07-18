/**
 * Next.js instrumentation — runs once on server startup.
 * Validates that all required environment variables are set so the app
 * fails fast with clear error messages instead of cryptic runtime failures.
 * Also initializes Sentry for error monitoring.
 */

import { checkSentryConfig } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { parseTriBoolEnv } from "@/lib/env-bool";
import { validateServerEnv, formatMissingEnvMessage } from "@/lib/server-env";
import { checkRotationWindowExpiry } from "@/lib/jwt-secret";
import { allSites, WILDCARD_PARENT_DOMAINS } from "@/config/sites";

export function register() {
  // Check Sentry configuration (actual init happens via withSentry wrapper)
  checkSentryConfig();

  const { missing, missingRecommended } = validateServerEnv();

  // Warn about recommended-but-missing vars (don't crash the worker)
  if (missingRecommended.length > 0 && process.env.NODE_ENV === "production") {
    logger.warn(
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
      logger.warn(message);
    }
  }

  // FIX-02: Warn if NODE_ENV is not production when any public-domain/cron env vars
  // are set (indicates a misconfigured production deploy).
  if (process.env.NODE_ENV !== "production" && !isBuild) {
    const hasPublicDomainVars = !!process.env.CRON_HOST || !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (hasPublicDomainVars) {
      logger.error(
        "NODE_ENV is not 'production' but CRON_HOST or public-domain env vars are set. " +
          "This likely indicates a misconfigured production deploy. " +
          "Set NODE_ENV=production in wrangler.jsonc vars for the production environment.",
      );
    }
  }

  // F-05: Refuse to start production with ALLOW_LOCALHOST_FALLBACK_IN_PROD
  // enabled on a non-localhost host. Prevents CI defaults from leaking into
  // real deployments via copy-paste of the CI env block.
  // Uses proper URL parsing instead of substring matching to prevent bypass
  // via strings like "localhost-fake.example.com".
  if (
    process.env.NODE_ENV === "production" &&
    !isBuild &&
    process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1" &&
    process.env.CI_LIGHTHOUSE_BUILD !== "1"
  ) {
    const appUrl = process.env.APP_URL ?? "";
    let isLocalhost = false;
    if (appUrl === "") {
      isLocalhost = true;
    } else {
      try {
        const parsed = new URL(appUrl);
        const hostname = parsed.hostname.toLowerCase();
        // Check for exact localhost or 127.0.0.1 match
        isLocalhost =
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "[::1]" ||
          hostname.startsWith("127.") ||
          hostname.startsWith("0:0:0:0:0:0:0:1");
      } catch {
        // Invalid URL - treat as non-localhost for safety
        isLocalhost = false;
      }
    }
    if (!isLocalhost) {
      throw new Error(
        `ALLOW_LOCALHOST_FALLBACK_IN_PROD=1 is set but APP_URL (${appUrl}) resolves to a ` +
          "public host. This is a security misconfiguration — remove the env var or set " +
          "APP_URL to a localhost address. Refusing to start.",
      );
    }
  }

  // Deep-audit B3/B4: alert on the admin-token revocation break-glass flag.
  // ADMIN_SESSION_TOKEN_REVOCATION_STRICT is tri-state (see lib/auth.ts):
  //   "true"  → revocation checked, fail-CLOSED on KV outage (expected prod value)
  //   unset   → revocation checked, fail-OPEN on KV outage (leaked admin
  //             token replayable during an outage — warn in prod)
  //   "false" → revocation NOT CHECKED AT ALL (emergency escape hatch —
  //             error loudly so Sentry fires if this is ever live in prod)
  if (process.env.NODE_ENV === "production" && !isBuild) {
    const revocationStrict = parseTriBoolEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT");
    if (revocationStrict === false) {
      logger.error(
        "BREAK-GLASS ACTIVE: ADMIN_SESSION_TOKEN_REVOCATION_STRICT=false — admin JWT " +
          "revocation checks are DISABLED. Logout, password reset, and forced session " +
          "invalidation have no effect on already-issued admin tokens. This flag must " +
          "only be set during a declared incident (see docs/runbooks/kv-outage.md) and " +
          "reverted immediately after recovery.",
      );
    } else if (revocationStrict === null) {
      logger.warn(
        "ADMIN_SESSION_TOKEN_REVOCATION_STRICT is unset — revocation checks fail OPEN " +
          "on KV outage, so a leaked admin token remains replayable while KV is down. " +
          "Set it to 'true' in wrangler.jsonc vars for production (deep-audit B3).",
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

  // AUD-09 / S1-A3.E1: Enforce the 24h rotation window for JWT_SECRET_PREVIOUS.
  // In production, throw to abort startup if the rotation window has expired.
  // In dev/test, warn so contributors are not blocked.
  if (!isBuild) {
    const rotationError = checkRotationWindowExpiry();
    if (rotationError) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(rotationError);
      } else {
        logger.warn(rotationError);
      }
    }
  }

  // A100-25: Validate APP_URL against known production domains at startup.
  // Catches typos, copy-paste errors, and misconfigured deploys early.
  if (process.env.NODE_ENV === "production" && !isBuild) {
    const appUrl = process.env.APP_URL ?? "";
    if (appUrl) {
      try {
        const parsed = new URL(appUrl);
        const host = parsed.hostname.toLowerCase();
        const knownDomains = allSites.map((s) => s.domain.toLowerCase());
        const isKnownDomain = knownDomains.includes(host);
        const isWildcardChild = WILDCARD_PARENT_DOMAINS.some((parent) =>
          host.endsWith(`.${parent.toLowerCase()}`),
        );
        const isLocal = host === "localhost" || host === "127.0.0.1";
        if (!isKnownDomain && !isWildcardChild && !isLocal) {
          logger.error(
            `APP_URL hostname "${host}" does not match any known production domain ` +
              `(${knownDomains.join(", ")}). This may indicate a misconfiguration.`,
          );
        }
      } catch {
        logger.error(`APP_URL ("${appUrl}") is not a valid URL.`);
      }
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

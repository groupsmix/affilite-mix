import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line no-restricted-imports -- health endpoint needs privileged client for DB liveness probe; getTenantClient() mints HS256 JWTs that break with asymmetric-only Supabase signing keys
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getClientIp } from "@/lib/get-client-ip";
import { getRateLimitKV, getRateLimiterDO, getAppCacheKV, getClickQueue } from "@/lib/runtime-env";
import { apiError } from "@/lib/api-error";

/** 10 health check requests per minute per IP */
const HEALTH_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000, failPolicy: "open" as const };

/**
 * GET /api/health
 *
 * Health check endpoint that verifies:
 * - The application is running
 * - Supabase database connectivity
 *
 * Returns 200 if healthy, 503 if degraded.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`health:${ip}`, HEALTH_RATE_LIMIT);
  if (!rl.allowed) {
    return apiError(
      429,
      "Too many requests",
      undefined,
      { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      "RATE_LIMITED",
    );
  }

  // M-8: Prefer a dedicated HEALTH_DETAIL_BEARER secret so health probes
  // don't share credentials with cron triggers. When HEALTH_DETAIL_BEARER is
  // set, ONLY that token grants access to the full checks object — the cron
  // credential is NOT evaluated as a fallback, preventing a cron token from
  // leaking env-var names (Issue 2).
  const healthBearer = process.env.HEALTH_DETAIL_BEARER?.trim();
  const authHeader = request.headers.get("authorization") ?? "";

  let isAuthorized: boolean;
  if (healthBearer) {
    // Bearer is configured — only the dedicated token grants detail access.
    isAuthorized = authHeader === `Bearer ${healthBearer}`;
  } else {
    // Bearer not configured — fall back to cron auth for backward compatibility
    // (e.g. dev environments that haven't set the dedicated secret yet).
    isAuthorized = verifyCronAuth(request);
  }

  if (!isAuthorized) {
    return NextResponse.json({ status: "healthy" });
  }

  const checks: Record<
    string,
    { status: "ok" | "warn" | "error"; latencyMs?: number; error?: string }
  > = {};

  // Check Supabase connectivity using the service-role client.
  // getTenantClient() mints a custom HS256 JWT which requires a symmetric
  // SUPABASE_JWT_SECRET — this breaks when Supabase is configured with
  // asymmetric-only signing keys. The health probe only needs a liveness
  // check, so the privileged (service-role) client is correct here.
  const dbStart = Date.now();
  try {
    const supabase = getPrivilegedSupabaseClient("health-check");
    // eslint-disable-next-line no-restricted-syntax -- Audited: health liveness probe; privileged client + unsafeNoSiteFilter + raw .from() all intentional (global DB ping, no tenant scope)
    const { error } = await supabase.from("sites").select("id").unsafeNoSiteFilter().limit(1);
    const latencyMs = Date.now() - dbStart;

    if (error) {
      checks.database = { status: "error", latencyMs, error: error.message };
      logger.error("Health check: database error", { error: error.message, latencyMs });
    } else {
      checks.database = { status: "ok", latencyMs };
    }
  } catch (err) {
    const latencyMs = Date.now() - dbStart;
    const message = err instanceof Error ? err.message : "Unknown error";
    checks.database = { status: "error", latencyMs, error: message };
    logger.error("Health check: database unreachable", { error: message, latencyMs });
  }

  // Check environment variables
  const requiredVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
    // Audit R-006: SUPABASE_JWT_SECRET is signed by lib/supabase-server.ts
    // (getAuthenticatedClient) so per-tenant Supabase calls degrade
    // immediately on a missing or rotated value. Surfacing it here
    // makes the failure visible in the authenticated health view.
    "SUPABASE_JWT_SECRET",
    // CRON_SECRET / CRON_HOST: the Cloudflare scheduled handler refuses
    // to dispatch without these. Their absence is a silent prod failure.
    "CRON_SECRET",
    "CRON_HOST",
    // INTERNAL_API_TOKEN: Cloudflare Queue consumer auth between the
    // Worker and /api/queue/clicks.
    "INTERNAL_API_TOKEN",
  ];
  const missingVars = requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    checks.environment = { status: "error", error: `Missing: ${missingVars.join(", ")}` };
  } else {
    checks.environment = { status: "ok" };
  }

  // Check RATE_LIMIT_KV Cloudflare binding.
  const kvPresent = getRateLimitKV() !== null;
  if (process.env.NODE_ENV === "production" && !kvPresent) {
    checks.kv_binding = {
      status: "error",
      error:
        "RATE_LIMIT_KV binding not available. Rate limits will fail open to per-isolate memory.",
    };
    logger.error("Health check: RATE_LIMIT_KV binding missing in production");
  } else {
    checks.kv_binding = { status: "ok" };
  }

  // Check RATE_LIMITER_DO Durable Object binding.
  const doPresent = getRateLimiterDO() !== null;
  if (process.env.NODE_ENV === "production" && !doPresent) {
    checks.do_binding = {
      status: "error",
      error: "RATE_LIMITER_DO binding not available. Distributed atomic rate limiting is disabled.",
    };
    logger.warn("Health check: RATE_LIMITER_DO binding missing in production");
  } else {
    checks.do_binding = { status: "ok" };
  }

  // Audit F-007: APP_CACHE_KV is consumed by middleware for dynamic
  // domain resolution. A missing binding silently degrades multi-tenant
  // routing without surfacing in dashboards, so it has the same
  // health-check posture as RATE_LIMIT_KV.
  const appCacheKvPresent = getAppCacheKV() !== null;
  if (process.env.NODE_ENV === "production" && !appCacheKvPresent) {
    checks.app_cache_kv_binding = {
      status: "error",
      error:
        "APP_CACHE_KV binding not available. Dynamic domain resolution will fall back to per-isolate memory.",
    };
    logger.error("Health check: APP_CACHE_KV binding missing in production");
  } else {
    checks.app_cache_kv_binding = { status: "ok" };
  }

  // Audit F-007: CLICK_QUEUE producer binding. The Worker's queue
  // consumer is unaffected by a missing binding here, but every
  // /api/track/click request still depends on this binding to publish
  // attribution events. Surfacing it makes silent click-loss visible.
  const clickQueuePresent = getClickQueue() !== null;
  if (process.env.NODE_ENV === "production" && !clickQueuePresent) {
    checks.click_queue_binding = {
      status: "error",
      error: "CLICK_QUEUE binding not available. Click attribution events cannot be enqueued.",
    };
    logger.error("Health check: CLICK_QUEUE binding missing in production");
  } else {
    checks.click_queue_binding = { status: "ok" };
  }

  // Check Resend email service (production-required for newsletter)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resendStart = Date.now();
      const res = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      const resendLatency = Date.now() - resendStart;
      if (res.ok) {
        checks.email = { status: "ok", latencyMs: resendLatency };
      } else {
        checks.email = {
          status: "error",
          latencyMs: resendLatency,
          error: `Resend API returned ${res.status}`,
        };
        logger.error("Health check: Resend API error", {
          status: res.status,
          latencyMs: resendLatency,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resend unreachable";
      checks.email = { status: "error", error: message };
      logger.error("Health check: Resend unreachable", { error: message });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Email is optional — newsletter features degrade gracefully without it.
    // Use "warn" so the overall status stays healthy and CI passes.
    checks.email = { status: "warn", error: "RESEND_API_KEY not set" };
  }

  // "warn" is non-critical — only "error" counts as unhealthy.
  const isHealthy = Object.values(checks).every((c) => c.status !== "error");

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: isHealthy ? 200 : 503 },
  );
}

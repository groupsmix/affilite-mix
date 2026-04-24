import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getClientIp } from "@/lib/get-client-ip";

/** 10 health check requests per minute per IP */
const HEALTH_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

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
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // For unauthenticated requests, return only a minimal status.
  // Detailed checks (DB latency, env vars, email service) are restricted
  // to authenticated callers (CRON_SECRET or admin JWT) to avoid leaking
  // infrastructure information (Finding 21).
  // Only CRON_SECRET bearer auth unlocks the detailed health view.
  // Cookie-presence is NOT a valid auth check — the admin session cookie is
  // "nh_admin_token", not "admin_token", so a fake cookie would have passed
  // the old check. Bearer auth avoids that class of bug entirely.
  const isAuthorized = verifyCronAuth(request);

  if (!isAuthorized) {
    return NextResponse.json({ status: "healthy" });
  }

  const checks: Record<string, { status: "ok" | "error"; latencyMs?: number; error?: string }> = {};

  // Check Supabase connectivity
  const dbStart = Date.now();
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("sites").select("id").limit(1);
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
  ];
  const missingVars = requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    checks.environment = { status: "error", error: `Missing: ${missingVars.join(", ")}` };
  } else {
    checks.environment = { status: "ok" };
  }

  // Check RATE_LIMIT_KV Cloudflare binding.
  const kv = (process.env as Record<string, unknown>).RATE_LIMIT_KV;
  const kvPresent = !!kv && typeof kv === "object" && "get" in kv && "put" in kv;
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
  const doLimiter = (process.env as Record<string, unknown>).RATE_LIMITER_DO;
  const doPresent = !!doLimiter && typeof doLimiter === "object" && "idFromName" in doLimiter;
  if (process.env.NODE_ENV === "production" && !doPresent) {
    checks.do_binding = {
      status: "error",
      error: "RATE_LIMITER_DO binding not available. Distributed atomic rate limiting is disabled.",
    };
    logger.warn("Health check: RATE_LIMITER_DO binding missing in production");
  } else {
    checks.do_binding = { status: "ok" };
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
    checks.email = { status: "error", error: "RESEND_API_KEY not set" };
  }

  const isHealthy = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: isHealthy ? 200 : 503 },
  );
}

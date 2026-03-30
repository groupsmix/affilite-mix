import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

/**
 * GET /api/health
 *
 * Health check endpoint that verifies:
 * - The application is running
 * - Supabase database connectivity
 *
 * Returns 200 if healthy, 503 if degraded.
 */
export async function GET() {
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
        checks.email = { status: "error", latencyMs: resendLatency, error: `Resend API returned ${res.status}` };
        logger.error("Health check: Resend API error", { status: res.status, latencyMs: resendLatency });
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

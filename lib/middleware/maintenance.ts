import { NextRequest, NextResponse } from "next/server";
import { getAppCacheKV } from "@/lib/runtime-env";
import type { MiddlewareContext } from "./compose";

// F-PERF-02: Per-isolate maintenance mode cache (30s TTL)
let _maintenanceCacheValue = false;
let _maintenanceCacheExpiry = 0;

/**
 * H-4/A-023: Maintenance mode gate.
 * Checked early so every route (including API) can be taken offline
 * without redeploying. Supports both an env var and a KV flag.
 */
export async function withMaintenance(
  request: NextRequest,
  ctx: MiddlewareContext,
): Promise<NextResponse | null> {
  const { pathname, signal } = ctx;

  if (pathname === "/api/health" || pathname === "/api/csp-report") {
    return null;
  }

  // Env-var based maintenance
  const maintenanceMode =
    process.env.APP_MAINTENANCE_MODE === "1" || process.env.APP_MAINTENANCE_MODE === "true";
  if (maintenanceMode) {
    return new NextResponse(JSON.stringify({ error: "Service temporarily unavailable." }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "120",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  }

  // KV-based maintenance with per-isolate 30s TTL cache
  try {
    if (signal?.aborted) return null;
    if (_maintenanceCacheExpiry < Date.now()) {
      const kv = getAppCacheKV();
      if (kv) {
        const kvMaintenance = await kv.get("maintenance_mode");
        if (signal?.aborted) return null;
        _maintenanceCacheValue =
          kvMaintenance?.toLowerCase() === "1" || kvMaintenance?.toLowerCase() === "true";
      }
      _maintenanceCacheExpiry = Date.now() + 30_000;
    }
    if (_maintenanceCacheValue) {
      return new NextResponse(JSON.stringify({ error: "Service temporarily unavailable." }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "120",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      });
    }
  } catch {
    // Ignore KV errors; maintenance gate is best-effort.
  }

  return null;
}

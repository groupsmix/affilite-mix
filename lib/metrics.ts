/**
 * RISK-14: Lightweight custom metrics layer for Cloudflare Workers.
 *
 * Emits structured metric events via console.log in a format that
 * Cloudflare Logpush can parse and forward to Grafana/Datadog.
 * Cloudflare Analytics Engine can also consume these via `writeDataPoint`.
 *
 * Usage:
 *   emitMetric("api_latency_ms", 42, { route: "/api/health", method: "GET" });
 *   emitMetric("click_processed", 1, { site_id: "ai-compared" });
 */

import { logger } from "@/lib/logger";

export interface MetricPoint {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: string;
}

/**
 * Emit a structured metric event.
 * In Cloudflare Workers, this logs a JSON line that Logpush can route
 * to an analytics backend. When Analytics Engine binding is available,
 * it also writes a data point directly.
 */
export function emitMetric(name: string, value: number, tags: Record<string, string> = {}): void {
  const point: MetricPoint = {
    name,
    value,
    tags,
    timestamp: new Date().toISOString(),
  };

  logger.info("metric", { metric: name, metric_value: value, ...tags });

  // If Analytics Engine binding is available (Cloudflare Workers runtime),
  // write a data point for real-time dashboards.
  try {
    const globalEnv = globalThis as Record<string, unknown>;
    const ae = globalEnv.ANALYTICS_ENGINE;
    if (ae && typeof (ae as Record<string, unknown>).writeDataPoint === "function") {
      (
        ae as { writeDataPoint: (p: { blobs: string[]; doubles: number[] }) => void }
      ).writeDataPoint({
        blobs: [name, JSON.stringify(tags)],
        doubles: [value],
      });
    }
  } catch {
    // Analytics Engine not available — metric is still logged above
  }

  return void point;
}

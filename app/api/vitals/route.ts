import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";

const VALID_METRIC_NAMES = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);

/**
 * POST /api/vitals — receives Core Web Vitals beacons from the client.
 *
 * The WebVitals component sends metrics via `navigator.sendBeacon` in
 * production. This endpoint validates the payload, persists it to the
 * `web_vitals` table (if available), and logs structured output for
 * ingestion by any log-based observability pipeline (e.g. Datadog, Vercel).
 */
/** 120 vitals beacons per minute per IP */
const VITALS_RATE_LIMIT = { maxRequests: 120, windowMs: 60 * 1000 };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`vitals:${ip}`, VITALS_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    // Basic shape validation
    if (!body || typeof body.name !== "string" || typeof body.value !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!VALID_METRIC_NAMES.has(body.name)) {
      return NextResponse.json({ error: "Unknown metric name" }, { status: 400 });
    }

    // Cap all string fields at 200 chars to prevent unbounded storage growth
    const capString = (val: unknown, maxLen = 200): string | undefined => {
      if (typeof val !== "string") return undefined;
      return val.slice(0, maxLen) || undefined;
    };

    // Strip PII (query parameters and fragments) from URLs
    const stripPiiFromUrl = (urlStr: unknown): string | undefined => {
      const capped = capString(urlStr);
      if (!capped) return undefined;
      try {
        // Only keep origin and pathname
        const u = new URL(capped);
        return u.origin + u.pathname;
      } catch {
        // If it's just a path like "/about", strip query/hash manually
        return capped.split("?")[0].split("#")[0];
      }
    };

    const metric = {
      name: body.name as string,
      value: body.value as number,
      id: capString(body.id),
      page: stripPiiFromUrl(body.page),
      href: stripPiiFromUrl(body.href),
      rating: capString(body.rating),
    };

    // Structured log for observability pipelines (Datadog, Vercel Logs, etc.)
    console.info(JSON.stringify({ event: "web_vital", ...metric, ts: Date.now() }));

    // Persist to DB (best-effort, don't block the response)
    try {
      const sb = getServiceClient();
      await sb.from("web_vitals").insert({
        name: metric.name,
        value: metric.value,
        metric_id: metric.id ?? null,
        page: metric.page ?? null,
        href: metric.href ?? null,
        rating: metric.rating ?? null,
      });
    } catch (dbErr) {
      // Table may not exist yet — log but don't fail the beacon
      captureException(dbErr, { context: "[api/vitals] DB insert failed (non-fatal):" });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

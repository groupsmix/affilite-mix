import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

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

    const body = await request.json();

    // Basic shape validation
    if (!body || typeof body.name !== "string" || typeof body.value !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!VALID_METRIC_NAMES.has(body.name)) {
      return NextResponse.json({ error: "Unknown metric name" }, { status: 400 });
    }

    const metric = {
      name: body.name as string,
      value: body.value as number,
      id: (body.id as string) ?? undefined,
      page: (body.page as string) ?? undefined,
      href: (body.href as string) ?? undefined,
      rating: (body.rating as string) ?? undefined,
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

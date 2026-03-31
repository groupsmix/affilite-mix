import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/vitals — receives Core Web Vitals beacons from the client.
 *
 * The WebVitals component sends metrics via `navigator.sendBeacon` in
 * production. This endpoint accepts the payload and can forward it to
 * an observability backend (e.g. Datadog, Sentry, BigQuery) in the future.
 *
 * For now it simply acknowledges receipt so the beacon does not 404.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic shape validation
    if (!body || typeof body.name !== "string" || typeof body.value !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // TODO: forward to observability backend
    // e.g. await fetch("https://analytics.example.com/vitals", { method: "POST", body: JSON.stringify(body) });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

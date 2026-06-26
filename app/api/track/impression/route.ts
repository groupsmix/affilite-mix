import { NextRequest, NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/dal/ad-impressions";
import { getCurrentSite } from "@/lib/site-context";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";
import { runAfterResponse } from "@/lib/wait-until";
import { isOriginAllowedForSite } from "@/lib/security/allowed-origins";

/** 120 ad impression requests per minute per IP.
 * SEC-15: failPolicy "closed" prevents impression fraud during KV outages. */
const IMPRESSION_RATE_LIMIT = {
  maxRequests: 120,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/** POST /api/track/impression — record an ad impression from the public site */
export async function POST(request: NextRequest) {
  try {
    // A97: enforce strict per-site Origin validation on this CSRF-exempt beacon endpoint.
    // Uses isOriginAllowedForSite (not the global allow-list) to prevent cross-tenant
    // telemetry spoofing. Only origins belonging to the resolved target site are allowed.
    const origin = request.headers.get("origin");
    const siteIdHeader = request.headers.get("x-site-id");
    if (!isOriginAllowedForSite(origin, siteIdHeader, request.headers.get("host"))) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`ad-impression:${ip}`, IMPRESSION_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const site = await getCurrentSite();
    const siteId = site.id; // site.id is already the resolved DB UUID

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const { ad_placement_id, page_path } = bodyOrError as {
      ad_placement_id?: string;
      page_path?: string;
    };

    if (!ad_placement_id || typeof ad_placement_id !== "string") {
      return NextResponse.json({ error: "ad_placement_id is required" }, { status: 400 });
    }

    // SEC-18: Validate ad_placement_id is a UUID to prevent injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ad_placement_id)) {
      return NextResponse.json({ error: "Invalid ad_placement_id format" }, { status: 400 });
    }

    // AUDIT-FIX A14-002: Validate page_path length and format to prevent
    // injection of arbitrary strings into the DB. Cap at 2048 chars and
    // require a leading slash with safe URL-path characters only.
    const MAX_PAGE_PATH_LENGTH = 2048;
    const PAGE_PATH_REGEX = /^\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/;
    const sanitizedPagePath = typeof page_path === "string" ? page_path : "/";
    if (
      sanitizedPagePath.length > MAX_PAGE_PATH_LENGTH ||
      !PAGE_PATH_REGEX.test(sanitizedPagePath)
    ) {
      return NextResponse.json({ error: "Invalid page_path" }, { status: 400 });
    }

    // Fire-and-forget via ctx.waitUntil so the isolate is not killed before
    // the insert completes under load.  We still respond immediately with
    // { ok: true } — the client does not need to block on persistence.
    void runAfterResponse(recordAdImpression(siteId, ad_placement_id, sanitizedPagePath), {
      context: "[api/track/impression] recordAdImpression",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/track/impression] POST failed:" });
    return NextResponse.json({ error: "Failed to record impression" }, { status: 500 });
  }
}

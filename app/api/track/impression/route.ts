import { NextRequest, NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/dal/ad-impressions";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getCurrentSite } from "@/lib/site-context";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";
import { runAfterResponse } from "@/lib/wait-until";
import { isOriginAllowed } from "@/lib/security/allowed-origins";

/** 120 ad impression requests per minute per IP */
const IMPRESSION_RATE_LIMIT = { maxRequests: 120, windowMs: 60 * 1000 };

/** POST /api/track/impression — record an ad impression from the public site */
export async function POST(request: NextRequest) {
  try {
    // FRESH-04: enforce Origin allow-list on this CSRF-exempt beacon endpoint.
    // The CSRF-exempt registry documents this as a compensating control; the
    // middleware cannot attach a CSRF token to sendBeacon() calls, so we
    // validate the request Origin against the per-site allow-list instead.
    // Pattern mirrors /api/vitals (G-47 / isOriginAllowed).
    const origin = request.headers.get("origin");
    const siteIdHeader = request.headers.get("x-site-id");
    if (!isOriginAllowed(origin, request.headers.get("host"), siteIdHeader)) {
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
    const siteId = await resolveDbSiteId(site.id);

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const { ad_placement_id, page_path } = bodyOrError as {
      ad_placement_id?: string;
      page_path?: string;
    };

    if (!ad_placement_id || typeof ad_placement_id !== "string") {
      return NextResponse.json({ error: "ad_placement_id is required" }, { status: 400 });
    }

    // Fire-and-forget via ctx.waitUntil so the isolate is not killed before
    // the insert completes under load.  We still respond immediately with
    // { ok: true } — the client does not need to block on persistence.
    void runAfterResponse(recordAdImpression(siteId, ad_placement_id, page_path ?? "/"), {
      context: "[api/track/impression] recordAdImpression",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/track/impression] POST failed:" });
    return NextResponse.json({ error: "Failed to record impression" }, { status: 500 });
  }
}

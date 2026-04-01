import { NextRequest, NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/dal/ad-impressions";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getCurrentSite } from "@/lib/site-context";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";

/** 120 ad impression requests per minute per IP */
const IMPRESSION_RATE_LIMIT = { maxRequests: 120, windowMs: 60 * 1000 };

/** POST /api/track/impression — record an ad impression from the public site */
export async function POST(request: NextRequest) {
  try {
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

    await recordAdImpression(siteId, ad_placement_id, page_path ?? "/");

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/track/impression] POST failed:" });
    return NextResponse.json({ error: "Failed to record impression" }, { status: 500 });
  }
}

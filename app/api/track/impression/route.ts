import { NextRequest, NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/dal/ad-impressions";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getCurrentSite } from "@/lib/site-context";
import { captureException } from "@/lib/sentry";

/** POST /api/track/impression — record an ad impression from the public site */
export async function POST(request: NextRequest) {
  try {
    const site = await getCurrentSite();
    const siteId = await resolveDbSiteId(site.id);

    const { ad_placement_id, page_path } = await request.json();

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

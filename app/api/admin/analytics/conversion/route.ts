import { NextResponse } from "next/server";
import { getConversionFunnel } from "@/lib/dal/analytics-dashboard";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/analytics/conversion — Conversion funnel.
 * Shows pipeline: Products Created → Active → Content Published → Clicks.
 */
export const GET = withAuthz("analytics", "view", async (_request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("analytics:conversion", session);
  if (rlResponse) return rlResponse;

  try {
    const funnel = await getConversionFunnel(siteId);
    return NextResponse.json({ funnel });
  } catch (err) {
    captureException(err, { context: "[api/admin/analytics/conversion] GET failed:" });
    return NextResponse.json({ error: "Failed to load conversion data" }, { status: 500 });
  }
});

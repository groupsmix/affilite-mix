import { NextRequest, NextResponse } from "next/server";
import { getDomainPerformance } from "@/lib/dal/analytics-dashboard";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/analytics/domains — Performance by domain/site.
 * Query params:
 *   ?days=7  — lookback window (default 7, max 365)
 */
export const GET = withAuthz("analytics", "view", async (request: NextRequest, { session }) => {
  const rlResponse = await enforceAdminRateLimit("analytics:domains", session);
  if (rlResponse) return rlResponse;

  try {
    const days = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("days") ?? "7"), 1),
      365,
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    const domains = await getDomainPerformance(since.toISOString());

    return NextResponse.json({ days, domains });
  } catch (err) {
    captureException(err, { context: "[api/admin/analytics/domains] GET failed:" });
    return NextResponse.json({ error: "Failed to load domain analytics" }, { status: 500 });
  }
});

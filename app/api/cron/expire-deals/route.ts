import { NextRequest, NextResponse } from "next/server";
import { expireDeals } from "@/lib/dal/deals";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";

/**
 * GET /api/cron/expire-deals
 * Hourly cron: auto-deactivates deals past their expiry date.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/expire-deals"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expired = await expireDeals(getPrivilegedSupabaseClient);
    logger.info(`Expire deals cron: deactivated ${expired} deals`);
    void recordCronLiveness("expire-deals");
    return NextResponse.json({ message: "Deals expiry check complete", expired });
  } catch (err) {
    captureException(err, { context: "[cron/expire-deals] failed" });
    logger.error("Expire deals cron failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to expire deals" }, { status: 500 });
  }
}

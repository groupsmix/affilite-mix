import { NextRequest, NextResponse } from "next/server";
import { expireDeals } from "@/lib/dal/deals";
import { logger } from "@/lib/logger";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/expire-deals
 * Hourly cron: auto-deactivates deals past their expiry date.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, { secretEnvVars: ["CRON_DEALS_SECRET", "CRON_SECRET"] })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expired = await expireDeals();
    logger.info(`Expire deals cron: deactivated ${expired} deals`);
    return NextResponse.json({ message: "Deals expiry check complete", expired });
  } catch (err) {
    logger.error("Expire deals cron failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to expire deals" }, { status: 500 });
  }
}

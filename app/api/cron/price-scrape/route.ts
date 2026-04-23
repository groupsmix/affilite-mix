import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { createPriceSnapshots } from "@/lib/dal/price-snapshots";
import { findTriggeredAlerts, markAlertTriggered } from "@/lib/dal/price-alerts";
import { logger } from "@/lib/logger";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/price-scrape
 * Daily cron job: snapshots current prices from products table,
 * checks for triggered price-drop alerts, and queues notification emails.
 *
 * Protected by CRON_SECRET header check.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = getServiceClient();

    // Fetch all active products with a numeric price
    const { data: products, error: prodError } = await sb
      .from("products")
      .select("id, site_id, price_amount, price_currency")
      .eq("status", "active")
      .not("price_amount", "is", null);

    if (prodError) throw prodError;
    if (!products || products.length === 0) {
      return NextResponse.json({ message: "No products with prices to snapshot", count: 0 });
    }

    // Create price snapshots in batch
    const snapshots = products
      .filter((p: { price_amount: number | null }) => p.price_amount !== null && p.price_amount > 0)
      .map(
        (p: {
          id: string;
          site_id: string;
          price_amount: number | null;
          price_currency: string;
        }) => ({
          product_id: p.id,
          site_id: p.site_id,
          price_amount: p.price_amount as number,
          currency: p.price_currency || "USD",
          source: "catalog",
        }),
      );

    const created = await createPriceSnapshots(snapshots);
    logger.info(`Price scrape: created ${created.length} snapshots`);

    // Check for triggered alerts
    let alertsTriggered = 0;
    for (const product of products) {
      if (!product.price_amount) continue;

      const triggered = await findTriggeredAlerts(product.id, product.price_amount as number);

      for (const alert of triggered) {
        await markAlertTriggered(alert.id);
        alertsTriggered++;

        // TODO: Queue email notification via Resend/SES
        // For now, log the trigger
        logger.info("Price alert triggered", {
          alertId: alert.id,
          email: alert.email,
          productId: alert.product_id,
          targetPrice: alert.target_price,
          currentPrice: product.price_amount,
        });
      }
    }

    return NextResponse.json({
      message: "Price scrape complete",
      snapshots_created: created.length,
      alerts_triggered: alertsTriggered,
    });
  } catch (err) {
    logger.error("Price scrape cron failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Price scrape failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
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
export async function POST(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = await getTenantClient();

    // Fetch all active products with a numeric price
    const { data: products, error: prodError } = await sb
      .from("products")
      .select("id, site_id, price_amount, price_currency, name, slug")
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
        // Send email notification via Resend
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? "noreply@example.com";
        const appUrl = process.env.APP_URL ?? `https://${product.site_id}`;

        let emailSent = false;

        if (resendKey) {
          const productUrl = `${appUrl}/p/${product.slug}`;
          const safeName = (product.name || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
          const safePrice = String(product.price_amount || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [alert.email],
              subject: `Price Drop Alert: ${product.name}`,
              html: `<p>Good news! The price for <strong>${safeName}</strong> has dropped to <strong>$${safePrice}</strong>.</p><p><a href="${productUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}">View Deal</a></p>`,
              text: `Good news! The price for ${product.name} has dropped to $${product.price_amount}.\n\nView Deal: ${productUrl}`,
            }),
          });

          if (!res.ok) {
            const errBody = await res.text();
            logger.error("Failed to send price alert email via Resend", {
              error: errBody,
              alertId: alert.id,
            });
            // If the email fails, we continue the loop and do NOT mark the alert
            // as triggered so it can be retried on the next cron run.
            continue;
          } else {
            emailSent = true;
          }
        } else {
          // Resend is not configured, but we still mark as triggered to avoid
          // infinite retries for this alert.
          logger.warn("Price alert triggered but RESEND_API_KEY is not configured", {
            alertId: alert.id,
          });
        }

        // Only mark the alert triggered if the email succeeded or Resend isn't configured
        await markAlertTriggered(alert.id);
        alertsTriggered++;

        // Log the trigger
        logger.info("Price alert triggered", {
          alertId: alert.id,
          email: alert.email,
          productId: alert.product_id,
          targetPrice: alert.target_price,
          currentPrice: product.price_amount,
          emailSent,
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

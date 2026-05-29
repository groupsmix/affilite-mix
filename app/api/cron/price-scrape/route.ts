import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { createPriceSnapshots } from "@/lib/dal/price-snapshots";
import { findTriggeredAlerts, markAlertTriggered } from "@/lib/dal/price-alerts";
import { getSiteRowById } from "@/lib/dal/sites";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";

/**
 * Resolve the public origin (https://<domain>) for a product's owning site.
 *
 * Price-alert emails go to subscribers across multiple tenants, so the
 * "View Deal" link MUST point at the actual domain that hosts the product
 * — not at the raw site UUID. We look up the row in the `sites` table by
 * its UUID and prefix the configured domain with `https://`. If the lookup
 * fails (DB error, missing row, mis-typed UUID), fall back to APP_URL so
 * the email still has a working link, even if it points at the canonical
 * default site instead of the tenant.
 */
async function resolveSiteOrigin(siteId: string): Promise<string> {
  try {
    const site = await getSiteRowById(siteId);
    if (site?.domain) {
      return `https://${site.domain}`;
    }
  } catch (err) {
    logger.warn("Failed to resolve site domain for price alert email", {
      siteId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return process.env.APP_URL ?? "";
}

/**
 * GET /api/cron/price-scrape
 * Daily cron job: snapshots current prices from products table,
 * checks for triggered price-drop alerts, and queues notification emails.
 *
 * Protected by CRON_SECRET header check.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret using timing-safe comparison.
  // Accepts the per-trigger secret first, then the shared CRON_SECRET fallback.
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/price-scrape"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = getPrivilegedSupabaseClient();

    // Fetch all active products with a numeric price
    const { data: products, error: prodError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
      .from("products")
      .select("id, site_id, price_amount, price_currency, name, slug")
      // F-API-01: daily price scrape iterates every tenant's catalog.
      .unsafeNoSiteFilter()
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
          price_currency: string | null;
        }) => ({
          product_id: p.id,
          site_id: p.site_id,
          price_amount: p.price_amount as number,
          currency: p.price_currency || "USD",
          source: "catalog",
        }),
      );

    const created = await createPriceSnapshots(snapshots, getPrivilegedSupabaseClient);
    logger.info(`Price scrape: created ${created.length} snapshots`);

    // Cache site-origin lookups across this cron run so we don't hit the DB
    // once per triggered alert when many alerts share a site.
    const siteOriginCache = new Map<string, string>();
    async function getSiteOrigin(siteId: string): Promise<string> {
      const cached = siteOriginCache.get(siteId);
      if (cached !== undefined) return cached;
      const origin = await resolveSiteOrigin(siteId);
      siteOriginCache.set(siteId, origin);
      return origin;
    }

    // Check for triggered alerts
    let alertsTriggered = 0;
    for (const product of products) {
      if (!product.price_amount) continue;

      const triggered = await findTriggeredAlerts(
        product.id,
        product.price_amount as number,
        getPrivilegedSupabaseClient,
      );

      for (const alert of triggered) {
        // Send email notification via Resend
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? "noreply@example.com";
        const siteOrigin = await getSiteOrigin(product.site_id);

        let emailSent = false;

        if (resendKey) {
          if (!siteOrigin) {
            // Without a tenant origin we'd send a broken "View Deal" link.
            // Skip retry-and-resend on the next cron run instead of mailing
            // a useless link.
            logger.error("Skipping price alert email: no site origin resolved", {
              alertId: alert.id,
              siteId: product.site_id,
            });
            continue;
          }
          // Outbound product link is the affiliate redirect route at /r/<slug>.
          const productUrl = `${siteOrigin}/r/${product.slug}`;
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
        await markAlertTriggered(alert.id, getPrivilegedSupabaseClient);
        alertsTriggered++;

        // Log the trigger
        logger.info("Price alert triggered", {
          alertId: alert.id,
          productId: alert.product_id,
          targetPrice: alert.target_price,
          currentPrice: product.price_amount,
          emailSent,
        });
      }
    }

    void recordCronLiveness("price-scrape");
    return NextResponse.json({
      message: "Price scrape complete",
      snapshots_created: created.length,
      alerts_triggered: alertsTriggered,
    });
  } catch (err) {
    captureException(err, { context: "[cron/price-scrape] failed" });
    logger.error("Price scrape cron failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Price scrape failed" }, { status: 500 });
  }
}

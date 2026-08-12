import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { createPriceSnapshots } from "@/lib/dal/price-snapshots";
import { findTriggeredAlertsForProducts, markAlertTriggered } from "@/lib/dal/price-alerts";
import { getSiteRowById } from "@/lib/dal/sites";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const PRODUCT_PAGE_SIZE = 250;
const MAX_PRODUCT_PAGES = 200;
const SNAPSHOT_BATCH_SIZE = 100;
const CATALOG_SNAPSHOT_SOURCE = "catalog_snapshot";
const RESEND_RETRY = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

type PrivilegedClient = ReturnType<typeof getPrivilegedSupabaseClient>;

type PriceScrapeProduct = {
  id: string;
  site_id: string;
  price_amount: number;
  price_currency: string | null;
  name: string;
  slug: string;
};

function parsePositivePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizePriceProduct(row: unknown): PriceScrapeProduct | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const raw = row as Record<string, unknown>;
  const price = parsePositivePrice(raw.price_amount);

  if (
    typeof raw.id !== "string" ||
    raw.id.trim() === "" ||
    typeof raw.site_id !== "string" ||
    raw.site_id.trim() === "" ||
    price === null ||
    typeof raw.slug !== "string" ||
    raw.slug.trim() === ""
  ) {
    return null;
  }

  return {
    id: raw.id,
    site_id: raw.site_id,
    price_amount: price,
    price_currency: typeof raw.price_currency === "string" ? raw.price_currency : null,
    name: typeof raw.name === "string" ? raw.name : "",
    slug: raw.slug,
  };
}

async function fetchProductPage(
  sb: PrivilegedClient,
  afterId: string | null,
): Promise<{
  products: PriceScrapeProduct[];
  rawCount: number;
  invalidCount: number;
  checkpoint: string | null;
}> {
  let query = sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
    .from("products")
    .select("id, site_id, price_amount, price_currency, name, slug")
    .unsafeNoSiteFilter()
    .eq("status", "active")
    .not("price_amount", "is", null)
    .order("id", { ascending: true });

  if (afterId) query = query.gt("id", afterId);

  const { data, error } = await query.limit(PRODUCT_PAGE_SIZE);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const finalRow = rows.at(-1);
  const checkpoint =
    finalRow &&
    typeof finalRow === "object" &&
    !Array.isArray(finalRow) &&
    typeof (finalRow as Record<string, unknown>).id === "string"
      ? String((finalRow as Record<string, unknown>).id)
      : null;

  if (rows.length > 0 && checkpoint === null) {
    throw new Error("Price catalog page is missing a valid product checkpoint");
  }

  const products = rows
    .map((row) => normalizePriceProduct(row))
    .filter((product): product is PriceScrapeProduct => product !== null);

  return {
    products,
    rawCount: rows.length,
    invalidCount: rows.length - products.length,
    checkpoint,
  };
}

function chunkProducts<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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
 * Daily cron job: snapshots catalog-maintained current prices,
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

    const snapshotDate = new Date().toISOString().slice(0, 10);
    let pagesFetched = 0;
    let productsScanned = 0;
    let productsSnapshotted = 0;
    let invalidProducts = 0;
    let lastProductId: string | null = null;
    let alertsTriggered = 0;
    let fullFinalPage = false;

    for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
      const { products, rawCount, invalidCount, checkpoint } = await fetchProductPage(
        sb,
        lastProductId,
      );
      if (rawCount === 0) break;

      pagesFetched++;
      productsScanned += rawCount;
      invalidProducts += invalidCount;
      fullFinalPage = rawCount === PRODUCT_PAGE_SIZE;
      lastProductId = checkpoint;

      const snapshots = products.map((product) => ({
        product_id: product.id,
        site_id: product.site_id,
        price_amount: product.price_amount,
        currency: product.price_currency || "USD",
        source: CATALOG_SNAPSHOT_SOURCE,
        snapshot_date: snapshotDate,
      }));

      for (const batch of chunkProducts(snapshots, SNAPSHOT_BATCH_SIZE)) {
        const created = await createPriceSnapshots(batch, () => sb);
        productsSnapshotted += created.length;
      }

      const productByScopedId = new Map(
        products.map((product) => [`${product.site_id}\u0000${product.id}`, product]),
      );
      const triggered = await findTriggeredAlertsForProducts(
        products.map((product) => ({
          site_id: product.site_id,
          product_id: product.id,
          current_price: product.price_amount,
        })),
        () => sb,
      );

      for (const alert of triggered) {
        const product = productByScopedId.get(`${alert.site_id}\u0000${alert.product_id}`);
        if (!product) continue;

        // Send email notification via Resend
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;
        const siteOrigin = await getSiteOrigin(product.site_id);

        let emailSent = false;

        if (resendKey) {
          if (!fromEmail) {
            const error = new Error("Price alert email sender is not configured");
            logger.error(error.message, { alertId: alert.id });
            captureException(error, { context: "[cron/price-scrape] sender not configured" });
            continue;
          }
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

          let res: Response;
          try {
            res = await fetchWithTimeout("https://api.resend.com/emails", {
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
              timeoutMs: 8_000,
              retry: RESEND_RETRY,
            });
          } catch (err) {
            logger.error("Failed to send price alert email via Resend", {
              error: err instanceof Error ? err.message : String(err),
              alertId: alert.id,
            });
            continue;
          }

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
        await markAlertTriggered(alert.site_id, alert.id, getPrivilegedSupabaseClient);
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

      if (rawCount < PRODUCT_PAGE_SIZE) break;
    }

    if (pagesFetched === MAX_PRODUCT_PAGES && fullFinalPage) {
      throw new Error(
        `Price catalog snapshot exceeded ${MAX_PRODUCT_PAGES} pages; last_product_id=${lastProductId ?? "none"}`,
      );
    }

    if (productsScanned === 0) {
      return NextResponse.json({ message: "No products with prices to snapshot", count: 0 });
    }

    void recordCronLiveness("price-scrape");
    return NextResponse.json({
      message: "Price catalog snapshot complete",
      products_scanned: productsScanned,
      products_snapshotted: productsSnapshotted,
      invalid_products: invalidProducts,
      pages_fetched: pagesFetched,
      last_product_id: lastProductId,
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

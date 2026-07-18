import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getProductById } from "./products";
// price_alerts ships with a service_role-only RLS policy by schema design
// (migrations 00046/00055/00078) — the public anon-insert path was deliberately
// removed in 00034. There is therefore no authenticated/anon policy that a
// request-scoped tenant client could satisfy, so EVERY caller of this DAL must
// use the privileged client. We encapsulate that choice here, in the audited
// data layer, rather than leaking it into route handlers. Cross-tenant access
// is enforced explicitly by the site_id predicates below and by
// productBelongsToSite(), not by RLS.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import

/** Default client for all price_alerts access: privileged (RLS is service_role-only). */
const priceAlertClient: DalClientGetter = getPrivilegedSupabaseClient;

export interface PriceAlertRow {
  id: string;
  product_id: string;
  site_id: string;
  email: string;
  target_price: number;
  currency: string;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "price_alerts";
// A23-01: Explicit column list. Note: email is PII — callers that don't need
// it should pass a narrower column string rather than this full constant.
const ALL_COLUMNS =
  "id, product_id, site_id, email, target_price, currency, is_active, triggered_at, created_at, updated_at" as const;

/** Subscribe to a price-drop alert */
export async function createPriceAlert(
  input: {
    product_id: string;
    site_id: string;
    email: string;
    target_price: number;
    currency?: string;
  },
  getClient: DalClientGetter = priceAlertClient,
): Promise<PriceAlertRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<PriceAlertRow>(data, "PriceAlert");
}

/**
 * Verify a product exists and belongs to the given site.
 * Used by the public price-alert endpoint to prevent a visitor on Site A from
 * subscribing to alerts on Site B's products. Uses the privileged client (see
 * file header) and validates the site relationship explicitly.
 */
export async function productBelongsToSite(productId: string, siteId: string): Promise<boolean> {
  const product = await getProductById(siteId, productId, priceAlertClient);
  return product !== null;
}

/** Get a user's alert for a product, scoped to a site */
export async function getPriceAlert(
  productId: string,
  email: string,
  siteId?: string,
  getClient: DalClientGetter = priceAlertClient,
): Promise<PriceAlertRow | null> {
  const sb = await getClient();

  // H2-FIX: Add site_id scoping to prevent cross-tenant alert visibility.
  // Without this, a productId from Site A could match an alert from Site B
  // exposing that tenant's target_price, currency, and site_id.
  let query = sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .eq("email", email)
    .eq("is_active", true);

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return rowOrNull<PriceAlertRow>(data);
}

/** Find all active alerts that should trigger for a given product + price */
export async function findTriggeredAlerts(
  siteId: string,
  productId: string,
  currentPrice: number,
  getClient: DalClientGetter = priceAlertClient,
): Promise<PriceAlertRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    // F-API-01: scope to the product's tenant. Without a site_id predicate the
    // privileged client throws at the await boundary, which is why this cron
    // was dead (every run 500'd before a single alert could fire).
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .gte("target_price", currentPrice);

  if (error) throw error;
  return assertRows<PriceAlertRow>(data);
}

/** Find active alerts for a bounded set of priced products */
export async function findTriggeredAlertsForProducts(
  products: {
    site_id: string;
    product_id: string;
    current_price: number;
  }[],
  getClient: DalClientGetter = priceAlertClient,
): Promise<PriceAlertRow[]> {
  if (products.length === 0) return [];

  const sb = await getClient();
  const siteIds = Array.from(new Set(products.map((product) => product.site_id))).sort();
  const productIds = Array.from(new Set(products.map((product) => product.product_id))).sort();
  const prices = new Map(
    products.map((product) => [
      `${product.site_id}\u0000${product.product_id}`,
      product.current_price,
    ]),
  );

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .in("site_id", siteIds)
    .in("product_id", productIds)
    .eq("is_active", true);

  if (error) throw error;

  return assertRows<PriceAlertRow>(data).filter((alert) => {
    const currentPrice = prices.get(`${alert.site_id}\u0000${alert.product_id}`);
    return currentPrice !== undefined && alert.target_price >= currentPrice;
  });
}

/** Mark an alert as triggered */
export async function markAlertTriggered(
  siteId: string,
  id: string,
  getClient: DalClientGetter = priceAlertClient,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb
    .from(TABLE)
    .update({ triggered_at: new Date().toISOString(), is_active: false })
    // F-API-01: satisfy the tenant guard and prevent any cross-tenant write.
    .eq("site_id", siteId)
    .eq("id", id)
    .is("triggered_at", null); // A10: Atomic update pattern to prevent race conditions
  if (error) throw error;
}

/** Unsubscribe from an alert (scoped by site_id to prevent cross-tenant IDOR) */
export async function deactivatePriceAlertScoped(
  id: string,
  siteId: string,
  getClient: DalClientGetter = priceAlertClient,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw error;
}

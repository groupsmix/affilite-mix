import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceAlertRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<PriceAlertRow>(data, "PriceAlert");
}

/** Get a user's alert for a product */
export async function getPriceAlert(
  productId: string,
  email: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceAlertRow | null> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<PriceAlertRow>(data);
}

/** List all active alerts for an email */
async function listAlertsByEmail(
  email: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceAlertRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("email", email)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return assertRows<PriceAlertRow>(data);
}

/** Find all active alerts that should trigger for a given product + price */
export async function findTriggeredAlerts(
  productId: string,
  currentPrice: number,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceAlertRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .eq("is_active", true)
    .gte("target_price", currentPrice);

  if (error) throw error;
  return assertRows<PriceAlertRow>(data);
}

/** Mark an alert as triggered */
export async function markAlertTriggered(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb
    .from(TABLE)
    .update({ triggered_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .is("triggered_at", null); // A10: Atomic update pattern to prevent race conditions
  if (error) throw error;
}

/** Unsubscribe from an alert (scoped by site_id to prevent cross-tenant IDOR) */
export async function deactivatePriceAlertScoped(
  id: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw error;
}

/** Unsubscribe all alerts for an email */
async function deactivateAllAlerts(
  email: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb
    .from(TABLE)
    .update({ is_active: false })
    .eq("email", email)
    .eq("site_id", siteId);
  if (error) throw error;
}

import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

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

/** Subscribe to a price-drop alert */
export async function createPriceAlert(input: {
  product_id: string;
  site_id: string;
  email: string;
  target_price: number;
  currency?: string;
}): Promise<PriceAlertRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<PriceAlertRow>(data, "PriceAlert");
}

/** Get a user's alert for a product */
export async function getPriceAlert(
  productId: string,
  email: string,
): Promise<PriceAlertRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<PriceAlertRow>(data);
}

/** List all active alerts for an email */
export async function listAlertsByEmail(email: string, siteId: string): Promise<PriceAlertRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
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
): Promise<PriceAlertRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .gte("target_price", currentPrice);

  if (error) throw error;
  return assertRows<PriceAlertRow>(data);
}

/** Mark an alert as triggered */
export async function markAlertTriggered(id: string): Promise<void> {
  const sb = getServiceClient();

  const { error } = await sb
    .from(TABLE)
    .update({ triggered_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) throw error;
}

/** Unsubscribe from an alert */
export async function deactivatePriceAlert(id: string): Promise<void> {
  const sb = getServiceClient();

  const { error } = await sb.from(TABLE).update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

/** Unsubscribe all alerts for an email */
export async function deactivateAllAlerts(email: string, siteId: string): Promise<void> {
  const sb = getServiceClient();

  const { error } = await sb
    .from(TABLE)
    .update({ is_active: false })
    .eq("email", email)
    .eq("site_id", siteId);
  if (error) throw error;
}

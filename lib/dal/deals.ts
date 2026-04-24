import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

export interface DealRow {
  id: string;
  site_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  discount_pct: number | null;
  original_price: number | null;
  deal_price: number | null;
  currency: string;
  source: string | null;
  url: string;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "deals";

/** List active deals for a site, sorted by discount % descending */
export async function listActiveDeals(siteId: string, limit: number = 50): Promise<DealRow[]> {
  const sb = getServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .lte("starts_at", now)
    .order("discount_pct", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  // Filter out expired deals client-side (Supabase doesn't support OR NULL in same filter easily)
  const rows = assertRows<DealRow>(data);
  return rows.filter((d) => !d.expires_at || new Date(d.expires_at) > new Date());
}

/** List featured deals */
export async function listFeaturedDeals(siteId: string): Promise<DealRow[]> {
  const sb = getServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .eq("is_featured", true)
    .lte("starts_at", now)
    .order("discount_pct", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) throw error;
  const rows = assertRows<DealRow>(data);
  return rows.filter((d) => !d.expires_at || new Date(d.expires_at) > new Date());
}

/** Get deal by ID */
export async function getDealById(id: string): Promise<DealRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return rowOrNull<DealRow>(data);
}

/** Create a deal */
export async function createDeal(input: {
  site_id: string;
  product_id?: string;
  title: string;
  description?: string;
  discount_pct?: number;
  original_price?: number;
  deal_price?: number;
  currency?: string;
  source?: string;
  url: string;
  starts_at?: string;
  expires_at?: string;
  is_featured?: boolean;
}): Promise<DealRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<DealRow>(data, "Deal");
}

/** Update a deal */
export async function updateDeal(
  id: string,
  input: Partial<
    Pick<
      DealRow,
      | "title"
      | "description"
      | "discount_pct"
      | "original_price"
      | "deal_price"
      | "url"
      | "expires_at"
      | "is_active"
      | "is_featured"
    >
  >,
): Promise<DealRow> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return assertRow<DealRow>(data, "Deal");
}

/** Auto-expire deals past their expiry date */
export async function expireDeals(): Promise<number> {
  const sb = getServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .update({ is_active: false, updated_at: now })
    .eq("is_active", true)
    .lt("expires_at", now)
    .select("id");

  if (error) throw error;
  return (data || []).length;
}

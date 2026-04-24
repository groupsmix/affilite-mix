import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

export interface MembershipRow {
  id: string;
  site_id: string;
  email: string;
  name: string | null;
  tier: "insider" | "pro";
  status: "active" | "cancelled" | "expired" | "past_due";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "memberships";

/** Create a membership */
export async function createMembership(input: {
  site_id: string;
  email: string;
  name?: string;
  tier?: "insider" | "pro";
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_start?: string;
  current_period_end?: string;
}): Promise<MembershipRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<MembershipRow>(data, "Membership");
}

/** Get active membership for email */
export async function getActiveMembership(
  email: string,
  siteId: string,
): Promise<MembershipRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("email", email)
    .eq("site_id", siteId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<MembershipRow>(data);
}

/** Get membership by Stripe subscription ID */
export async function getMembershipByStripeSubscription(
  subscriptionId: string,
): Promise<MembershipRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<MembershipRow>(data);
}

/** Update membership (e.g. after Stripe webhook) */
export async function updateMembership(
  id: string,
  input: Partial<
    Pick<
      MembershipRow,
      | "status"
      | "stripe_customer_id"
      | "stripe_subscription_id"
      | "current_period_start"
      | "current_period_end"
      | "cancelled_at"
      | "email"
    >
  >,
): Promise<MembershipRow> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<MembershipRow>(data, "Membership");
}

/** List all members for a site */
export async function listMembers(siteId: string, status?: string): Promise<MembershipRow[]> {
  const sb = getServiceClient();

  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<MembershipRow>(data);
}

/** Get member count for a site */
export async function getMemberCount(siteId: string): Promise<number> {
  const sb = getServiceClient();

  const { count, error } = await sb
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "active");

  if (error) throw error;
  return count || 0;
}

import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

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
const LIST_COLUMNS =
  "id, site_id, email, name, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancelled_at, created_at, updated_at" as const;

/** Create a membership */
async function createMembership(
  input: {
    site_id: string;
    email: string;
    name?: string;
    tier?: "insider" | "pro";
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    current_period_start?: string;
    current_period_end?: string;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MembershipRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<MembershipRow>(data, "Membership");
}

/** Get active membership for email */
export async function getActiveMembership(
  email: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MembershipRow | null> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("email", email)
    .eq("site_id", siteId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<MembershipRow>(data);
}

/** Get membership by Stripe subscription ID */
async function getMembershipByStripeSubscription(
  subscriptionId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MembershipRow | null> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<MembershipRow>(data);
}

/** Update membership (e.g. after Stripe webhook) */
async function updateMembership(
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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MembershipRow> {
  const sb = await getClient();

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
async function listMembers(
  siteId: string,
  status?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MembershipRow[]> {
  const sb = await getClient();

  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
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
async function getMemberCount(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();

  const { count, error } = await sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "active");

  if (error) throw error;
  return count || 0;
}

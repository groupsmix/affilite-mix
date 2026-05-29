import { rowOrNull } from "./type-guards";
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

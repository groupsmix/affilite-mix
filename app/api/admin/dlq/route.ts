import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { untypedFrom } from "@/lib/dal/type-guards";
import { unauthorizedResponse } from "@/lib/admin-guard";

/**
 * GET /api/admin/dlq — R-014 / E3#16: DLQ monitoring dashboard endpoint.
 *
 * Returns summary stats and recent entries from:
 *   - webhook_dlq (Stripe webhook dead letters)
 *   - click_failures (click queue dead letters)
 *
 * Uses the tenant-scoped client — webhook_dlq and click_failures are
 * tenant-isolated via site_id, so RLS handles the scoping.
 */
export const GET = withAuthz("publishing", "read", async (_request, { session }) => {
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const sb = await getTenantClient();

  const [webhookDlq, clickFailures] = await Promise.all([
    sb
      .from("webhook_dlq") // eslint-disable-line no-restricted-syntax -- Audited: admin super_admin-gated DLQ dashboard read
      .select("id, event_id, event_type, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    untypedFrom(sb, "click_failures")
      .select("id, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const pendingCount = await sb
    .from("webhook_dlq") // eslint-disable-line no-restricted-syntax -- Audited: admin super_admin-gated DLQ dashboard count
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({
    webhook_dlq: {
      pending: pendingCount.count ?? 0,
      recent: webhookDlq.data ?? [],
      error: webhookDlq.error?.message ?? null,
    },
    click_failures: {
      recent: clickFailures.data ?? [],
      error: clickFailures.error?.message ?? null,
    },
  });
});

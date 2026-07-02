import { NextRequest, NextResponse } from "next/server";
import { reorderPages } from "@/lib/dal/pages";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

/**
 * PUT /api/admin/pages/reorder
 * Body: { pages: [{ id, sort_order }] }
 */
export const PUT = withAuthz(
  "settings",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("pages-reorder", session);
    if (rlResponse) return rlResponse;

    try {
      const bodyOrError = await parseJsonBody(request);
      if (bodyOrError instanceof NextResponse) return bodyOrError;
      const body = bodyOrError;

      if (!Array.isArray(body.pages)) {
        return NextResponse.json({ error: "pages array is required" }, { status: 400 });
      }

      // Bind to the withAuthz-validated siteId so the minted JWT carries
      // app_metadata.site_id and the reorder_pages SECURITY DEFINER RPC
      // executes with the correct tenant context.
      await reorderPages(siteId, body.pages, () => getTenantClientForSite(siteId, session.userId));

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "reorder",
        entity_type: "page",
        entity_id: "bulk",
        details: { count: body.pages.length },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/pages] reorder failed:" });
      return NextResponse.json({ error: "Failed to reorder pages" }, { status: 500 });
    }
  },
);

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { setLinkedProducts } from "@/lib/dal/content-products";
import { validateSetLinkedProducts } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

export const PUT = withAuthz(
  "content",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content-products", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const parsed = validateSetLinkedProducts(rawOrError);
    if (parsed.errors) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.errors },
        { status: 400 },
      );
    }

    try {
      await setLinkedProducts(parsed.data.content_id, siteId, parsed.data.links);
      void revalidateTag(`content:${siteId}`);
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "content_products",
        entity_id: parsed.data.content_id,
        details: { linked_count: parsed.data.links.length },
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      // Ownership failures from setLinkedProducts surface as plain Errors —
      // treat them as 404 rather than 500 so we don't leak or fabricate a
      // server-side problem for what is really a site-scoping violation.
      const message = err instanceof Error ? err.message : "";
      if (
        message === "Content not found for this site" ||
        message === "One or more products do not belong to this site"
      ) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      captureException(err, { context: "[api/admin/content-products] PUT failed:" });
      return NextResponse.json({ error: "Failed to update linked products" }, { status: 500 });
    }
  },
);

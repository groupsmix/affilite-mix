import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { contentTag } from "@/lib/cache-tags";
import { getContentById, createContent } from "@/lib/dal/content";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

export const POST = withAuthz(
  "content",
  "create",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content-clone", session);
    if (rlResponse) return rlResponse;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const { id } = bodyOrError;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const original = await getContentById(siteId, id, getClient);
      if (!original) {
        return NextResponse.json({ error: "Content not found" }, { status: 404 });
      }

      const cloned = await createContent(
        {
          site_id: siteId,
          title: `${original.title} (Copy)`,
          slug: `${original.slug}-copy-${Date.now()}`,
          body: original.body,
          excerpt: original.excerpt,
          featured_image: original.featured_image,
          type: original.type,
          status: "draft",
          category_id: original.category_id,
          tags: original.tags,
          author: original.author,
          publish_at: null,
          meta_title: original.meta_title,
          meta_description: original.meta_description,
          og_image: original.og_image,
          body_previous: null,
          review_state: "draft",
        },
        getClient,
      );

      void revalidateTag(contentTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "clone",
        entity_type: "content",
        entity_id: cloned.id,
        details: { original_id: id, title: cloned.title },
      });

      return NextResponse.json(cloned, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/content/clone] POST failed:" });
      return NextResponse.json({ error: "Failed to clone content" }, { status: 500 });
    }
  },
);

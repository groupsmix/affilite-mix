import { NextRequest, NextResponse } from "next/server";
import { shareContent, unshareContent, listSharedTargets } from "@/lib/dal/shared-content";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

/** List sites a piece of content is shared to */
export const GET = withAuthz(
  "content",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content-share", session);
    if (rlResponse) return rlResponse;

    const contentId = request.nextUrl.searchParams.get("content_id");
    if (!contentId) {
      return NextResponse.json({ error: "content_id is required" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const targets = await listSharedTargets(siteId, contentId, getClient);
      return NextResponse.json(targets);
    } catch (err) {
      captureException(err, { context: "[api/admin/content/share] GET failed:" });
      return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
    }
  },
);

/** Share content to another site */
export const POST = withAuthz(
  "content",
  "publish",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content-share", session);
    if (rlResponse) return rlResponse;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const { content_id, target_site_id } = bodyOrError;
    if (!content_id || !target_site_id) {
      return NextResponse.json(
        { error: "content_id and target_site_id are required" },
        { status: 400 },
      );
    }

    // SEC-19: Validate UUIDs to prevent injection via crafted identifiers
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(content_id as string) || !UUID_RE.test(target_site_id as string)) {
      return NextResponse.json(
        { error: "content_id and target_site_id must be valid UUIDs" },
        { status: 400 },
      );
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const shared = await shareContent(
        content_id as string,
        siteId,
        target_site_id as string,
        getClient,
      );

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "share",
        entity_type: "content",
        entity_id: content_id as string,
        details: { target_site_id: target_site_id as string },
      });

      return NextResponse.json(shared, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/content/share] POST failed:" });
      return NextResponse.json({ error: "Failed to share content" }, { status: 500 });
    }
  },
);

/** Remove a cross-niche share */
export const DELETE = withAuthz(
  "content",
  "publish",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content-share", session);
    if (rlResponse) return rlResponse;

    const delBodyOrError = await parseJsonBody(request);
    if (delBodyOrError instanceof NextResponse) return delBodyOrError;
    const { content_id, target_site_id } = delBodyOrError;
    if (!content_id || !target_site_id) {
      return NextResponse.json(
        { error: "content_id and target_site_id are required" },
        { status: 400 },
      );
    }

    // SEC-19: Validate UUIDs to prevent injection via crafted identifiers
    // (mirrors the POST handler so the unshare path closes the same vector).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(content_id as string) || !UUID_RE.test(target_site_id as string)) {
      return NextResponse.json(
        { error: "content_id and target_site_id must be valid UUIDs" },
        { status: 400 },
      );
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      await unshareContent(siteId, content_id as string, target_site_id as string, getClient);

      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "unshare",
        entity_type: "content",
        entity_id: content_id as string,
        details: { target_site_id: target_site_id as string },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/content/share] DELETE failed:" });
      return NextResponse.json({ error: "Failed to unshare content" }, { status: 500 });
    }
  },
);

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { shareContent, unshareContent, listSharedTargets } from "@/lib/dal/shared-content";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/** List sites a piece of content is shared to */
export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const contentId = request.nextUrl.searchParams.get("content_id");
  if (!contentId) {
    return NextResponse.json({ error: "content_id is required" }, { status: 400 });
  }

  try {
    const targets = await listSharedTargets(contentId);
    return NextResponse.json(targets);
  } catch (err) {
    captureException(err, { context: "[api/admin/content/share] GET failed:" });
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

/** Share content to another site */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { content_id, target_site_id } = bodyOrError;
  if (!content_id || !target_site_id) {
    return NextResponse.json(
      { error: "content_id and target_site_id are required" },
      { status: 400 },
    );
  }

  try {
    const shared = await shareContent(content_id as string, dbSiteId, target_site_id as string);

    recordAuditEvent({
      site_id: dbSiteId,
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
}

/** Remove a cross-niche share */
export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const delBodyOrError = await parseJsonBody(request);
  if (delBodyOrError instanceof NextResponse) return delBodyOrError;
  const { content_id, target_site_id } = delBodyOrError;
  if (!content_id || !target_site_id) {
    return NextResponse.json(
      { error: "content_id and target_site_id are required" },
      { status: 400 },
    );
  }

  try {
    await unshareContent(content_id as string, target_site_id as string);

    recordAuditEvent({
      site_id: dbSiteId,
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
}

import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { listMedia, deleteMedia, getMediaById } from "@/lib/dal/media";
import { isR2Configured, deletePublicObject } from "@/lib/r2";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/admin/media
 *
 * List media rows for the active site. Scoped by the server-derived siteId
 * from the admin session, so a caller cannot query another tenant's uploads.
 */
export const GET = withAuthz("upload", "view", async (request, { siteId, session }) => {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const getClient = () => getTenantClientForSite(siteId, session.userId);
  const media = await listMedia({ siteId, limit, offset }, getClient);
  return NextResponse.json({ media });
});

/**
 * DELETE /api/admin/media?id=<uuid>
 *
 * Removes a media row and the underlying public R2 object. The site_id
 * filter enforces tenant isolation.
 */
export const DELETE = withAuthz("upload", "delete", async (request, { siteId, session }) => {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const getClient = () => getTenantClientForSite(siteId, session.userId);
  const media = await getMediaById(siteId, id, getClient);
  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (isR2Configured()) {
    try {
      await deletePublicObject(media.public_key);
    } catch (err) {
      captureException(err, { context: "[api/admin/media] failed to delete public object" });
    }
  }

  await deleteMedia(siteId, id, getClient);

  return NextResponse.json({ ok: true });
});

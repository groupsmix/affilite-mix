import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { generatePreviewToken } from "@/lib/preview-token";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/**
 * POST /api/admin/preview-token
 * Generate a short-lived preview token for draft/scheduled content.
 * Body: { slug: string, contentType: string }
 */
export const POST = withAuthz("content", "edit", async (request, { siteId: dbSiteId }) => {
  try {
    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;

    if (!bodyOrError.slug || !bodyOrError.contentType) {
      return NextResponse.json({ error: "slug and contentType are required" }, { status: 400 });
    }

    const token = await generatePreviewToken({
      slug: bodyOrError.slug as string,
      contentType: bodyOrError.contentType as string,
      siteId: dbSiteId,
    });

    return NextResponse.json({ token });
  } catch (err) {
    captureException(err, { context: "[api/admin/preview-token] POST failed:" });
    return NextResponse.json({ error: "Failed to generate preview token" }, { status: 500 });
  }
});

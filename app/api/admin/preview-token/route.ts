import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { generatePreviewToken } from "@/lib/preview-token";
import { captureException } from "@/lib/sentry";

/**
 * POST /api/admin/preview-token
 * Generate a short-lived preview token for draft/scheduled content.
 * Body: { slug: string, contentType: string }
 */
export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const { slug, contentType } = await request.json();

    if (!slug || !contentType) {
      return NextResponse.json(
        { error: "slug and contentType are required" },
        { status: 400 },
      );
    }

    const token = await generatePreviewToken({
      slug,
      contentType,
      siteId: dbSiteId,
    });

    return NextResponse.json({ token });
  } catch (err) {
    captureException(err, { context: "[api/admin/preview-token] POST failed:" });
    return NextResponse.json(
      { error: "Failed to generate preview token" },
      { status: 500 },
    );
  }
}

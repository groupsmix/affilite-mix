import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { generatePreviewToken } from "@/lib/preview-token";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

// AUDIT-FIX A14-003: Validate slug/contentType format to prevent injection
const SLUG_REGEX = /^[a-z0-9-]{1,120}$/;
const VALID_CONTENT_TYPES = new Set(["article", "review", "comparison", "guide"]);

/**
 * POST /api/admin/preview-token
 * Generate a short-lived preview token for draft/scheduled content.
 * Body: { slug: string, contentType: string }
 */
export const POST = withAuthz("content", "edit", async (request, { session, siteId: dbSiteId }) => {
  const rlResponse = await enforceAdminRateLimit("preview-token", session);
  if (rlResponse) return rlResponse;

  try {
    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;

    const slug = typeof bodyOrError.slug === "string" ? bodyOrError.slug : "";
    const contentType = typeof bodyOrError.contentType === "string" ? bodyOrError.contentType : "";

    if (!slug || !contentType) {
      return NextResponse.json({ error: "slug and contentType are required" }, { status: 400 });
    }

    // AUDIT-FIX A14-003: Validate slug against known pattern
    if (!SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: "slug must be 1-120 lowercase alphanumeric characters and hyphens only" },
        { status: 400 },
      );
    }

    // AUDIT-FIX A14-003: Validate contentType against known allowlist
    if (!VALID_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `contentType must be one of: ${[...VALID_CONTENT_TYPES].join(", ")}` },
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
    return NextResponse.json({ error: "Failed to generate preview token" }, { status: 500 });
  }
});

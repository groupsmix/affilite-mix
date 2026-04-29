import { NextRequest, NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getUploadUrl, isR2Configured, R2_MAX_UPLOAD_BYTES, sanitizeOriginalName } from "@/lib/r2";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { recordAuditEvent } from "@/lib/audit-log";

/**
 * Allowed image content types.
 *
 * SVG is intentionally excluded — SVGs can contain embedded JavaScript and
 * are a known XSS vector when served from the same origin. The mapping is
 * also enforced inside `lib/r2.ts` so any drift fails closed.
 */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * POST /api/admin/upload — request a presigned R2 upload URL.
 *
 * Audit-driven hardening (#U-1 / #U-2 / #U-8 / #U-9):
 *   • The R2 object key is generated server-side as
 *     `uploads/YYYY/MM/DD/<uuid>.<ext>`. The client-supplied filename is
 *     captured only in `x-amz-meta-original-name` after sanitization.
 *   • Both `Content-Type` and `Content-Length` are signed into the
 *     presigned URL so R2 rejects bodies that exceed our cap or that
 *     change MIME after presign.
 *   • Audit logging happens in `/api/admin/upload/finalize` after
 *     magic-byte validation succeeds. This route only records a
 *     pre-upload intent line via the request trace ID.
 *   • The presign response carries `X-Content-Type-Options: nosniff`
 *     and `Cache-Control: no-store` so the JSON itself is not cached.
 */
export const POST = withAuthz("upload", "create", async (request, { siteId }) => {
  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (or R2_PRIVATE_BUCKET + R2_PUBLIC_BUCKET), and R2_PUBLIC_URL.",
      },
      { status: 503 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const contentType = bodyOrError.contentType as string | undefined;
  const fileSize = bodyOrError.fileSize as number | undefined;
  const originalName = sanitizeOriginalName(bodyOrError.fileName);

  if (!contentType) {
    return NextResponse.json({ error: "contentType is required" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only image uploads are allowed (JPEG, PNG, WebP, GIF, AVIF)" },
      { status: 400 },
    );
  }
  if (
    typeof fileSize !== "number" ||
    !Number.isFinite(fileSize) ||
    !Number.isInteger(fileSize) ||
    fileSize <= 0
  ) {
    return NextResponse.json({ error: "fileSize must be a positive integer" }, { status: 400 });
  }
  if (fileSize > R2_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File size exceeds the ${R2_MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 },
    );
  }

  try {
    // Thread siteId so per-tenant pessimistic R2-storage accounting
    // (G-42) actually fires for admin uploads. Without this, the
    // recordUsage() call inside getUploadUrl is a no-op and the
    // `r2_storage_bytes` counter never advances.
    const presigned = await getUploadUrl(contentType, fileSize, { originalName, siteId });

    // FIX-34 (F-017): Audit log for upload presign request
    // A-03: Use real siteId from auth context instead of hardcoded zero UUID
    void recordAuditEvent({
      site_id: siteId,
      actor: "admin-upload",
      action: "upload_presign",
      entity_type: "upload",
      entity_id: presigned.stagingKey,
      details: { contentType, fileSize, originalName },
    });

    const res = NextResponse.json({
      uploadUrl: presigned.uploadUrl,
      stagingKey: presigned.stagingKey,
      publicUrl: presigned.publicUrl,
      requiredHeaders: presigned.requiredHeaders,
      maxBytes: presigned.maxBytes,
    });
    // Defense-in-depth headers for the JSON response itself.
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  } catch (err) {
    captureException(err, { context: "[api/admin/upload] POST failed:" });
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

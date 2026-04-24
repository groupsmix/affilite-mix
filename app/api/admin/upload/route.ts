import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getUploadUrl, isR2Configured } from "@/lib/r2";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/** POST /api/admin/upload — get a presigned R2 upload URL */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL environment variables.",
      },
      { status: 503 },
    );
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const fileName = bodyOrError.fileName as string | undefined;
  const contentType = bodyOrError.contentType as string | undefined;
  const fileSize = bodyOrError.fileSize as number | undefined;

  if (!fileName || !contentType) {
    return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
  }

  // Validate content type against an explicit allowlist.
  // SVG is intentionally excluded — SVGs can contain embedded JavaScript
  // and are a known XSS vector when served from the same origin.
  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only image uploads are allowed (JPEG, PNG, WebP, GIF, AVIF)" },
      { status: 400 },
    );
  }

  // Validate file size
  if (typeof fileSize === "number" && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
      { status: 400 },
    );
  }

  try {
    const { uploadUrl, publicUrl } = await getUploadUrl(
      fileName,
      contentType,
      typeof fileSize === "number" ? fileSize : undefined,
    );
    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "upload",
      entity_type: "image",
      entity_id: fileName,
      details: { contentType, publicUrl },
    });
    const res = NextResponse.json({ uploadUrl, publicUrl });
    res.headers.set("Content-Disposition", "attachment");
    return res;
  } catch (err) {
    captureException(err, { context: "[api/admin/upload] POST failed:" });
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

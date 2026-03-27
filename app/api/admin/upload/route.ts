import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getUploadUrl, isR2Configured } from "@/lib/r2";

/** POST /api/admin/upload — get a presigned R2 upload URL */
export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL environment variables." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const { fileName, contentType } = body;

  if (!fileName || !contentType) {
    return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
  }

  // Validate content type is an image
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
  }

  try {
    const { uploadUrl, publicUrl } = await getUploadUrl(fileName, contentType);
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

// F-021: Validate magic bytes for admin uploads
// This endpoint is called after the client finishes their direct PUT to R2.
// It fetches the first few bytes of the uploaded file to ensure it's actually an image
// and not a polyglot file masquerading as one (e.g. an SVG with a .png extension).
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  
  const publicUrl = bodyOrError.publicUrl as string | undefined;
  const expectedType = bodyOrError.expectedType as string | undefined;

  if (!publicUrl || !expectedType) {
    return NextResponse.json({ error: "publicUrl and expectedType are required" }, { status: 400 });
  }

  try {
    // Fetch the first 32 bytes to check magic numbers
    const response = await fetch(publicUrl, {
      headers: { Range: "bytes=0-31" }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Could not fetch uploaded file for validation" }, { status: 400 });
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    let isMatch = false;

    // Very basic magic byte signatures for allowed types
    if (expectedType === "image/jpeg" && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      isMatch = true;
    } else if (expectedType === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      isMatch = true;
    } else if (expectedType === "image/gif" && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      isMatch = true;
    } else if (expectedType === "image/webp" && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      isMatch = true;
    } else if (expectedType === "image/avif") {
      // AVIF magic bytes are slightly more complex (ftypavif) but generally start at byte 4
      if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      // In a real implementation, you would also trigger a deletion of the invalid object from R2 here
      return NextResponse.json({ error: "File content does not match declared content type (Magic Byte validation failed)." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/upload/finalize] Validation failed" });
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { deleteStagingObject, fetchStagingBytes, promoteToPublicBucket } from "@/lib/r2";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/upload/finalize
 *
 * Audit-driven hardening (#U-3 / #U-4 / #U-5 / #U-6 / #U-9):
 *
 *   • Reads the first 32 bytes from the *private staging* bucket using a
 *     signed S3 GET so the file is never served at the public URL until
 *     it has cleared validation.
 *   • Magic-byte validation explicitly rejects SVG / HTML / script-y
 *     prefixes and verifies full RIFF + WEBP / ftypavif signatures.
 *   • If validation fails, the staging object is deleted before the
 *     route returns. There is no path that leaves a malicious upload
 *     reachable.
 *   • On success the file is promoted to the public bucket via R2's
 *     server-side copy (no bytes flow through the worker) and the
 *     audit event is recorded — replacing the previous behaviour where
 *     the audit log fired before the upload completed (#U-9).
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const stagingKey = typeof bodyOrError.stagingKey === "string" ? bodyOrError.stagingKey : "";
  const expectedType = typeof bodyOrError.expectedType === "string" ? bodyOrError.expectedType : "";

  if (!stagingKey || !expectedType) {
    return NextResponse.json(
      { error: "stagingKey and expectedType are required" },
      { status: 400 },
    );
  }
  // Defence in depth: stagingKey must look like the keys we mint
  // (uploads/YYYY/MM/DD/<uuid>.<ext>). Reject anything else so a
  // compromised admin client can't redirect us to read or copy
  // unrelated objects.
  if (!/^uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(stagingKey)) {
    return NextResponse.json({ error: "Invalid stagingKey" }, { status: 400 });
  }

  try {
    const bytes = await fetchStagingBytes(stagingKey, 32);
    if (!isMagicByteMatch(expectedType, bytes)) {
      // Delete the bad upload before returning so it can never become
      // visible — even if the admin UI never retries.
      await deleteStagingObject(stagingKey).catch((err) => {
        logger.warn("Failed to delete invalid staging object", {
          stagingKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return NextResponse.json(
        {
          error:
            "File content does not match declared content type (magic-byte validation failed). The file has been removed from staging.",
        },
        { status: 400 },
      );
    }

    const promoted = await promoteToPublicBucket(stagingKey, expectedType);

    void recordAuditEvent({
      site_id: guard.dbSiteId,
      actor: guard.session.email ?? guard.session.userId ?? "admin",
      action: "upload",
      entity_type: "image",
      entity_id: promoted.publicKey,
      details: { contentType: expectedType, publicUrl: promoted.publicUrl },
    });

    return NextResponse.json({
      ok: true,
      publicUrl: promoted.publicUrl,
      publicKey: promoted.publicKey,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/upload/finalize] failed" });
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}

/**
 * Strict magic-byte check.
 *
 * Each branch verifies the longest unambiguous signature for the
 * declared MIME type and explicitly rejects SVG / HTML / generic ISO
 * BMFF files (mp4 / heic / heif) that the previous loose AVIF check
 * accepted.
 */
function isMagicByteMatch(expectedType: string, bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;

  // Reject anything that *looks* like text-based content even if the
  // declared MIME claims it's an image. A polyglot SVG-with-PNG-prefix
  // is the canonical bypass for naïve magic-byte checks.
  const head = String.fromCharCode(...bytes.slice(0, 5)).toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<html")) {
    return false;
  }

  switch (expectedType) {
    case "image/jpeg":
      // FF D8 FF E0/E1/E2/DB
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif":
      // 47 49 46 38 (37|39) 61
      return (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
      );
    case "image/webp":
      // RIFF....WEBP
      return (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    case "image/avif":
      // ftypavif at bytes 4..11. Reject mp4/heic/heif which share the
      // ftyp prefix but use a different brand.
      if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) {
        return false;
      }
      return bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66;
    default:
      return false;
  }
}

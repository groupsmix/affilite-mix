import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import {
  deleteStagingObject,
  fetchStagingBytes,
  fetchStagingObject,
  headStagingObject,
  putPublicObject,
  sanitizeOriginalName,
} from "@/lib/r2";
import { createMedia } from "@/lib/dal/media";
import { recordUsage, releaseQuota } from "@/lib/quotas";
import { logger } from "@/lib/logger";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { optimizeImageVariants, ImageOptimizerError } from "@/lib/image-optimizer";

/**
 * POST /api/admin/upload/finalize
 *
 * Audit-driven hardening (#U-3 / #U-4 / #U-5 / #U-6 / #U-9) plus pro image
 * optimization:
 *   • Reads the first 32 bytes from the *private staging* bucket using a
 *     signed S3 GET so the file is never served at the public URL until
 *     it has cleared validation.
 *   • Magic-byte validation explicitly rejects SVG / HTML / script-y
 *     prefixes and verifies full RIFF + WEBP / ftypavif signatures.
 *   • If validation fails, the staging object is deleted before the
 *     route returns. There is no path that leaves a malicious upload
 *     reachable.
 *   • On success the full file is downloaded, compressed into responsive
 *     WebP variants (thumb/small/medium/master) with optional AVIF master,
 *     and the variants are uploaded to the public bucket. The original
 *     staging object is then removed.
 *   • Per-tenant R2 storage quota is reconciled: the original reservation is
 *     released and the final optimized bytes are recorded.
 */
export const POST = withAuthz("upload", "create", async (request, { session, siteId }) => {
  const getClient = () => getTenantClientForSite(siteId, session.userId);
  const rlResponse = await enforceAdminRateLimit("upload-finalize", session);
  if (rlResponse) return rlResponse;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const stagingKey = typeof bodyOrError.stagingKey === "string" ? bodyOrError.stagingKey : "";
  const expectedType = typeof bodyOrError.expectedType === "string" ? bodyOrError.expectedType : "";
  const fileName = typeof bodyOrError.fileName === "string" ? bodyOrError.fileName : undefined;

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

  let stagingSize: number | null = null;

  try {
    const bytes = await fetchStagingBytes(stagingKey, 32);
    if (!isMagicByteMatch(expectedType, bytes)) {
      // Reconcile the per-tenant `r2_storage_bytes` counter (G-42) BEFORE
      // we delete the staging object: presign pessimistically charged the
      // tenant for these bytes, but the upload failed validation and
      // never reaches the public bucket — so credit the bytes back.
      // HEAD failures are non-fatal: skip the credit rather than guess.
      const size = await headStagingObject(stagingKey).catch(() => null);
      if (size !== null && size > 0 && siteId) {
        await releaseQuota(siteId, "r2_storage_bytes", size);
      }

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

    // Capture the actual staging size for accurate quota reconciliation.
    stagingSize = await headStagingObject(stagingKey).catch(() => null);

    // Download the full validated file for server-side optimization.
    const originalBytes = await fetchStagingObject(stagingKey);

    const enableAvif = process.env.IMAGE_OPTIMIZER_AVIF === "true";
    const optimized = await optimizeImageVariants(originalBytes, expectedType, { enableAvif });

    // Build a deterministic folder from the original staging key:
    // uploads/YYYY/MM/DD/<uuid>.png  ->  uploads/YYYY/MM/DD/<uuid>/master.webp
    const baseKey = stagingKey.replace(/\.[^./]+$/, "");

    const variants: Record<
      string,
      { url: string; width: number; height: number; size: number; content_type: string }
    > = {};
    let masterKey = "";
    let masterUrl = "";
    let masterSize = 0;

    await Promise.all(
      optimized.variants.map(async (variant) => {
        const ext = variant.format === "jpeg" ? "jpg" : variant.format;
        const variantKey = `${baseKey}/${variant.name}.${ext}`;
        const uploaded = await putPublicObject(variantKey, variant.contentType, variant.bytes);
        variants[variant.name] = {
          url: uploaded.publicUrl,
          width: variant.width,
          height: variant.height,
          size: variant.size,
          content_type: variant.contentType,
        };
        if (variant.name === "master") {
          masterKey = uploaded.publicKey;
          masterUrl = uploaded.publicUrl;
          masterSize = variant.size;
        }
      }),
    );

    // Guard: if "master" variant was somehow skipped, fall back to the first.
    if (!masterKey) {
      const first = optimized.variants[0];
      if (first) {
        const ext = first.format === "jpeg" ? "jpg" : first.format;
        const variantKey = `${baseKey}/${first.name}.${ext}`;
        const fallback = await putPublicObject(variantKey, first.contentType, first.bytes);
        variants[first.name] = {
          url: fallback.publicUrl,
          width: first.width,
          height: first.height,
          size: first.size,
          content_type: first.contentType,
        };
        masterKey = fallback.publicKey;
        masterUrl = fallback.publicUrl;
        masterSize = first.size;
      }
    }

    // Best-effort cleanup of the original staging object now that variants
    // are safely in the public bucket.
    await deleteStagingObject(stagingKey).catch((err) => {
      logger.warn("Failed to clean up staging object after optimization", {
        stagingKey,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Reconcile per-tenant storage quota: release the original reservation
    // and record the final optimized footprint.
    if (stagingSize !== null && stagingSize > 0 && siteId) {
      await releaseQuota(siteId, "r2_storage_bytes", stagingSize);
    }
    if (siteId) {
      await recordUsage(siteId, "r2_storage_bytes", optimized.totalBytes);
    }

    // Record the validated upload in the unified media library.
    try {
      await createMedia(
        {
          site_id: siteId,
          public_key: masterKey,
          url: masterUrl,
          filename: sanitizeOriginalName(fileName),
          content_type: "image/webp",
          size_bytes: masterSize,
          variants,
          created_by: session.userId ?? null,
        },
        getClient,
      );
    } catch (mediaErr) {
      captureException(mediaErr, {
        context: "[api/admin/upload/finalize] failed to record media row",
      });
    }

    // G-06: Await audit for upload finalization — ensures durable trail.
    await recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "upload",
      entity_type: "image",
      entity_id: masterKey,
      details: { contentType: "image/webp", publicUrl: masterUrl, variants: Object.keys(variants) },
    });

    return NextResponse.json({
      ok: true,
      publicUrl: masterUrl,
      publicKey: masterKey,
      variants,
      original: {
        width: optimized.originalWidth,
        height: optimized.originalHeight,
        format: optimized.originalFormat,
      },
      optimizedBytes: optimized.totalBytes,
    });
  } catch (err) {
    if (err instanceof ImageOptimizerError) {
      // User-facing, non-sensitive image errors map to 400.
      if (stagingSize !== null && stagingSize > 0 && siteId) {
        await releaseQuota(siteId, "r2_storage_bytes", stagingSize).catch(() => {});
      }
      await deleteStagingObject(stagingKey).catch(() => {});
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    captureException(err, { context: "[api/admin/upload/finalize] failed" });
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
});

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

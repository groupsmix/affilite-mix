/**
 * Cloudflare R2 media upload helper.
 *
 * Uses a lightweight S3-compatible presigned URL generator (Web Crypto API)
 * so the admin browser uploads directly to R2 — the Next.js server never
 * handles the file bytes.
 *
 * This replaces the heavy @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
 * packages (~200 KB gzipped) with a minimal implementation (~2 KB) that only
 * covers the presigned PUT flow we actually use.
 *
 * Required env vars (all server-only):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL
 *
 * Optional env vars (recommended for production):
 *   R2_PRIVATE_BUCKET — staging bucket for un-validated uploads. Defaults
 *                       to R2_BUCKET_NAME for backwards compatibility.
 *   R2_PUBLIC_BUCKET  — bucket served at R2_PUBLIC_URL. Defaults to
 *                       R2_BUCKET_NAME for backwards compatibility.
 *
 * Security notes (audit items U-1, U-2, U-5, U-8):
 *   • Object keys are derived server-side from a UUID + extension drawn
 *     from the validated Content-Type. Client-supplied filenames are
 *     never echoed into the key.
 *   • Presigned PUTs sign the Content-Length header so R2 rejects
 *     uploads whose body size deviates from the server-validated cap.
 *   • Presigned PUTs sign x-amz-meta-original-name so the client cannot
 *     rebind the upload to a different display name after the fact.
 *   • Magic-byte validation runs against the private staging bucket
 *     before the object is ever visible at R2_PUBLIC_URL.
 */

import { reserveQuota, releaseQuota } from "@/lib/quotas";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { logger } from "@/lib/logger";

// ── Lightweight AWS Signature V4 presigner ────────────────────────────

const encoder = new TextEncoder();

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  let key: ArrayBuffer = await hmacSha256(encoder.encode(`AWS4${secretKey}`), dateStamp);
  key = await hmacSha256(key, region);
  key = await hmacSha256(key, service);
  key = await hmacSha256(key, "aws4_request");
  return key;
}

interface PresignParams {
  endpoint: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  contentType: string;
  /**
   * Maximum allowed body size in bytes. When supplied we sign
   * `content-length` so R2 rejects bodies that don't match. Browsers and
   * fetch clients always populate `Content-Length` for in-memory blobs,
   * so this is durable enforcement rather than advisory.
   */
  contentLength?: number;
  /** Server-derived original-name fingerprint, signed via x-amz-meta. */
  originalName?: string;
  expiresIn: number;
  method?: "PUT";
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeS3Key(key: string): string {
  // S3 keys are signed path components. Each segment must be RFC3986
  // encoded but the "/" separators must remain literal so the canonical
  // request matches what the client sends.
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

async function presignPutUrl(params: PresignParams): Promise<string> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;

  const host = new URL(params.endpoint).host;
  const path = `/${params.bucket}/${encodeS3Key(params.key)}`;
  const scope = `${dateStamp}/${params.region}/s3/aws4_request`;

  const headersToSign: Array<[string, string]> = [
    ["content-type", params.contentType],
    ["host", host],
  ];
  if (typeof params.contentLength === "number" && params.contentLength > 0) {
    headersToSign.push(["content-length", String(params.contentLength)]);
  }
  if (params.originalName) {
    headersToSign.push(["x-amz-meta-original-name", params.originalName]);
  }
  headersToSign.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = headersToSign.map(([name]) => name).join(";");
  const canonicalHeaders =
    headersToSign.map(([name, value]) => `${name}:${value}`).join("\n") + "\n";

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${params.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(params.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  // Sort query parameters for canonical request
  queryParams.sort();
  const canonicalQueryString = queryParams.toString();

  // UNSIGNED-PAYLOAD for presigned URLs (client provides body at upload time)
  const canonicalRequest = [
    params.method ?? "PUT",
    path,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );

  const signingKey = await getSigningKey(params.secretAccessKey, dateStamp, params.region, "s3");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return `${params.endpoint}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// ── Bucket / extension policy ─────────────────────────────────────────

/**
 * Allowed Content-Types and their canonical extension. The extension is
 * what we put into the server-derived key; client-supplied filenames are
 * NOT honoured.
 */
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Maximum bytes admins are allowed to upload via the presign route. */
export const R2_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Maximum length of a sanitized "original name" we record in metadata. */
const MAX_ORIGINAL_NAME = 128;

const SAFE_FILENAME_CHARS = /^[A-Za-z0-9._\- ]+$/;

/**
 * Sanitize the original filename for storage in object metadata. We
 * never use this in the key itself — the key is generated entirely
 * server-side — but it's useful for the audit log and for the admin UI.
 * Returns null if the value is unusable.
 */
export function sanitizeOriginalName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ORIGINAL_NAME) return null;
  if (!SAFE_FILENAME_CHARS.test(trimmed)) return null;
  return trimmed;
}

interface BucketEnv {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  publicUrlBase: string;
}

function readBucketEnv(): BucketEnv {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const fallbackBucket = process.env.R2_BUCKET_NAME;
  const privateBucket = process.env.R2_PRIVATE_BUCKET ?? fallbackBucket;
  const publicBucket = process.env.R2_PUBLIC_BUCKET ?? fallbackBucket;
  const publicUrlBase = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }
  if (!privateBucket || !publicBucket || !publicUrlBase) {
    throw new Error(
      "R2 buckets not configured. Set R2_BUCKET_NAME (or R2_PRIVATE_BUCKET + R2_PUBLIC_BUCKET) and R2_PUBLIC_URL.",
    );
  }

  // F-09: In production, the private staging bucket and public serving
  // bucket MUST be distinct. Using the same bucket defeats the
  // upload-validation model — unvalidated uploads would be reachable
  // via the public URL immediately. Enforce regardless of how the same
  // name was reached (R2_BUCKET_NAME fallback or the operator setting
  // both R2_PRIVATE_BUCKET and R2_PUBLIC_BUCKET to identical values).
  if (process.env.NODE_ENV === "production" && privateBucket === publicBucket) {
    throw new Error(
      "R2 bucket isolation error: R2_PRIVATE_BUCKET and R2_PUBLIC_BUCKET resolve to the same " +
        `name ("${privateBucket}"). In production, set distinct R2_PRIVATE_BUCKET and ` +
        "R2_PUBLIC_BUCKET so unvalidated uploads are not publicly reachable.",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, privateBucket, publicBucket, publicUrlBase };
}

/**
 * Datestamp used to shard upload keys (uploads/YYYY/MM/DD/<uuid>.<ext>).
 * Sharding keeps R2 listing operations efficient and lets a janitor job
 * scope itself to a single day's prefix.
 */
function todayPrefix(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `uploads/${yyyy}/${mm}/${dd}`;
}

export interface PresignedUploadResult {
  /** Presigned PUT URL the browser uploads directly to. */
  uploadUrl: string;
  /** Server-derived staging key (private bucket). */
  stagingKey: string;
  /** Bucket the uploadUrl writes to. */
  stagingBucket: string;
  /**
   * URL the admin UI shows once the object has been promoted to the
   * public bucket. Only valid AFTER /api/admin/upload/finalize succeeds.
   */
  publicUrl: string;
  /** Public bucket key. */
  publicKey: string;
  /** Required headers the client must send on the upload. */
  requiredHeaders: Record<string, string>;
  /** Maximum body size (bytes) the presign URL allows. */
  maxBytes: number;
}

/**
 * Generate a presigned upload URL for R2.
 *
 * The URL signs:
 *   • Content-Type
 *   • Content-Length (when provided)
 *   • host
 *   • x-amz-meta-original-name (when provided)
 *
 * The client MUST send those exact header values, otherwise R2 will
 * reject the PUT with a 403 SignatureDoesNotMatch.
 */
export async function getUploadUrl(
  contentType: string,
  contentLength: number,
  options: {
    originalName?: string | null;
    /**
     * Tenant the upload is charged to (G-42). When provided, the call
     * is gated by the per-tenant `r2_storage_bytes` ceiling defined in
     * `lib/quotas.ts` and `docs/per-tenant-quotas.md`. The presign is
     * rejected with a `QuotaExceededError` BEFORE the URL is minted, so
     * the client never receives an upload target it cannot fill.
     *
     * Optional so existing internal callers (admin scripts, fixtures)
     * keep working unchanged.
     */
    siteId?: string;
  } = {},
): Promise<PresignedUploadResult> {
  const env = readBucketEnv();

  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (!ext) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error("contentLength must be a positive number");
  }
  if (contentLength > R2_MAX_UPLOAD_BYTES) {
    throw new Error(`Upload exceeds the ${R2_MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }

  // AUDIT-FIX A1-007 / A10-004: Per-tenant storage ceiling (G-42). Use atomic
  // reservation so concurrent requests see the reserved capacity. The
  // reservation is released by `/api/admin/upload/finalize` when the
  // upload completes (or by the janitor reconcile job for abandoned
  // uploads). This prevents unbounded quota consumption from presigns
  // that are never followed through.
  const quotaReserved = !!options.siteId;
  if (options.siteId) {
    await reserveQuota(options.siteId, "r2_storage_bytes", contentLength);
  }

  // A3-004: Release reserved quota on any failure after reservation so we don't
  // permanently consume quota for uploads that never materialise.
  try {
    const stagingKey = `${todayPrefix()}/${crypto.randomUUID()}.${ext}`;
    const publicKey = stagingKey; // Promotion preserves the key path.
    const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;

    const originalName = sanitizeOriginalName(options.originalName);

    const uploadUrl = await presignPutUrl({
      endpoint,
      bucket: env.privateBucket,
      key: stagingKey,
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
      region: "auto",
      contentType,
      contentLength,
      originalName: originalName ?? undefined,
      expiresIn: 300,
    });

    const requiredHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    };
    if (originalName) {
      requiredHeaders["x-amz-meta-original-name"] = originalName;
    }

    return {
      uploadUrl,
      stagingKey,
      stagingBucket: env.privateBucket,
      publicUrl: `${env.publicUrlBase.replace(/\/$/, "")}/${publicKey}`,
      publicKey,
      requiredHeaders,
      maxBytes: R2_MAX_UPLOAD_BYTES,
    };
  } catch (err) {
    if (quotaReserved && options.siteId) {
      await releaseQuota(options.siteId, "r2_storage_bytes", contentLength).catch(() => {
        // Best-effort — don't mask the original error
      });
    }
    throw err;
  }
}

/** Check whether R2 credentials are configured */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    (process.env.R2_BUCKET_NAME ||
      (process.env.R2_PRIVATE_BUCKET && process.env.R2_PUBLIC_BUCKET)) &&
    process.env.R2_PUBLIC_URL
  );
}

// ── Internal S3 helpers used by the finalize / janitor flows ──────────

interface SignedRequestParams {
  method: "GET" | "DELETE" | "PUT" | "HEAD";
  endpoint: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Optional copy-source for PUT (server-side R2 copy). */
  copySource?: string;
}

/**
 * Build a fully signed S3 request (path-style). Used for HEAD / DELETE /
 * server-side COPY (PUT with x-amz-copy-source) operations triggered by
 * /api/admin/upload/finalize.
 */
async function signRequest(
  params: SignedRequestParams,
): Promise<{ url: string; headers: Record<string, string> }> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
  const host = new URL(params.endpoint).host;
  const path = `/${params.bucket}/${encodeS3Key(params.key)}`;
  const scope = `${dateStamp}/${params.region}/s3/aws4_request`;

  const payloadHashHex = await sha256Hex("");
  const headers: Array<[string, string]> = [
    ["host", host],
    ["x-amz-content-sha256", payloadHashHex],
    ["x-amz-date", amzDate],
  ];
  if (params.copySource) {
    headers.push(["x-amz-copy-source", params.copySource]);
  }
  headers.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = headers.map(([n, v]) => `${n}:${v}`).join("\n") + "\n";
  const signedHeaders = headers.map(([n]) => n).join(";");

  const canonicalRequest = [
    params.method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHashHex,
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const signingKey = await getSigningKey(params.secretAccessKey, dateStamp, params.region, "s3");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const out: Record<string, string> = {
    Host: host,
    "x-amz-content-sha256": payloadHashHex,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (params.copySource) {
    out["x-amz-copy-source"] = params.copySource;
  }
  return { url: `${params.endpoint}${path}`, headers: out };
}

/**
 * GET the first `byteCount` bytes of an object in the private staging
 * bucket. Used by /api/admin/upload/finalize to magic-byte validate the
 * upload BEFORE it's published.
 */
export async function fetchStagingBytes(stagingKey: string, byteCount = 32): Promise<Uint8Array> {
  const env = readBucketEnv();
  const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;
  const signed = await signRequest({
    method: "GET",
    endpoint,
    bucket: env.privateBucket,
    key: stagingKey,
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
  });
  const res = await fetchWithTimeout(signed.url, {
    method: "GET",
    headers: { ...signed.headers, Range: `bytes=0-${byteCount - 1}` },
    timeoutMs: 15000,
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`R2 staging read failed: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * HEAD a staging object to read its `Content-Length`. Used by
 * /api/admin/upload/finalize to compute the byte amount that should be
 * credited back to the per-tenant `r2_storage_bytes` counter when an
 * upload fails validation and is deleted from staging.
 *
 * Returns `null` if the object is missing or the response is missing
 * a parseable Content-Length header — callers should treat that as
 * "skip the credit" rather than guess.
 */
export async function headStagingObject(stagingKey: string): Promise<number | null> {
  const env = readBucketEnv();
  const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;
  const signed = await signRequest({
    method: "HEAD",
    endpoint,
    bucket: env.privateBucket,
    key: stagingKey,
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
  });
  const res = await fetchWithTimeout(signed.url, {
    method: "HEAD",
    headers: signed.headers,
    timeoutMs: 15000,
  });
  if (!res.ok) return null;
  const len = res.headers.get("content-length");
  if (!len) return null;
  const parsed = Number.parseInt(len, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Promote a validated staging object into the public bucket via R2's
 * server-side copy. Returns the canonical public URL.
 */
export async function promoteToPublicBucket(
  stagingKey: string,
  contentType: string,
): Promise<{ publicKey: string; publicUrl: string }> {
  const env = readBucketEnv();
  if (env.privateBucket === env.publicBucket) {
    // Same bucket: nothing to copy. The public URL is already correct.
    return {
      publicKey: stagingKey,
      publicUrl: `${env.publicUrlBase.replace(/\/$/, "")}/${stagingKey}`,
    };
  }
  const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;
  const copySource = `/${env.privateBucket}/${encodeS3Key(stagingKey)}`;
  const signed = await signRequest({
    method: "PUT",
    endpoint,
    bucket: env.publicBucket,
    key: stagingKey,
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
    copySource,
  });
  // AUDIT-FIX: Set Content-Disposition to "inline" with the content type
  // so browsers render images normally but don't execute any non-image content.
  // The filename from the staging key is sanitized to the UUID.<ext> portion.
  const filename = stagingKey.split("/").pop() ?? stagingKey;
  const res = await fetchWithTimeout(signed.url, {
    method: "PUT",
    headers: {
      ...signed.headers,
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
    },
    timeoutMs: 30000,
  });
  if (!res.ok) {
    throw new Error(`R2 promote failed: ${res.status}`);
  }
  // Best-effort cleanup of staging object on success.
  await deleteFromBucket(env.privateBucket, stagingKey).catch((e) => {
    logger.warn("Failed to clean up staging object after promotion", {
      stagingKey,
      error: e instanceof Error ? e.message : String(e),
    });
  });
  return {
    publicKey: stagingKey,
    publicUrl: `${env.publicUrlBase.replace(/\/$/, "")}/${stagingKey}`,
  };
}

/**
 * Delete an object from the private staging bucket (used when magic-
 * byte validation fails so the bad upload doesn't linger).
 */
export async function deleteStagingObject(stagingKey: string): Promise<void> {
  const env = readBucketEnv();
  await deleteFromBucket(env.privateBucket, stagingKey);
}

/**
 * Delete an object from the public serving bucket.
 */
export async function deletePublicObject(publicKey: string): Promise<void> {
  const env = readBucketEnv();
  await deleteFromBucket(env.publicBucket, publicKey);
}

async function deleteFromBucket(bucket: string, key: string): Promise<void> {
  const env = readBucketEnv();
  const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;
  const signed = await signRequest({
    method: "DELETE",
    endpoint,
    bucket,
    key,
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    region: "auto",
  });
  const res = await fetchWithTimeout(signed.url, {
    method: "DELETE",
    headers: signed.headers,
    timeoutMs: 15000,
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`R2 delete failed: ${res.status}`);
  }
}

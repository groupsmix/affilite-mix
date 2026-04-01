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
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */

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
  contentLength?: number;
  expiresIn: number;
}

async function presignPutUrl(params: PresignParams): Promise<string> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;

  const host = new URL(params.endpoint).host;
  const path = `/${params.bucket}/${params.key}`;
  const scope = `${dateStamp}/${params.region}/s3/aws4_request`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${params.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(params.expiresIn),
    "X-Amz-SignedHeaders": "content-type;host",
  });
  // Sort query parameters for canonical request
  queryParams.sort();
  const canonicalQueryString = queryParams.toString();

  const canonicalHeaders = `content-type:${params.contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  // UNSIGNED-PAYLOAD for presigned URLs (client provides body at upload time)
  const canonicalRequest = [
    "PUT",
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

// ── Public API ────────────────────────────────────────────────────────

/** Generate a presigned upload URL for R2. Returns { uploadUrl, publicUrl }. */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
  contentLength?: number,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }
  if (!bucket || !publicBase) {
    throw new Error("R2_BUCKET_NAME and R2_PUBLIC_URL must be set.");
  }

  const key = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const uploadUrl = await presignPutUrl({
    endpoint,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    region: "auto",
    contentType,
    contentLength,
    expiresIn: 300,
  });

  const publicUrl = `${publicBase}/${key}`;
  return { uploadUrl, publicUrl };
}

/** Check whether R2 credentials are configured */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

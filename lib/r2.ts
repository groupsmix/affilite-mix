/**
 * Cloudflare R2 media upload helper.
 *
 * Uses the S3-compatible API via presigned URLs so the admin browser
 * uploads directly to R2 — the Next.js server never handles the file bytes.
 *
 * Required env vars (all server-only):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Create a fresh S3Client for R2 on each call.
 *
 * On Cloudflare Workers, module-level singletons can persist across requests
 * within the same isolate but are lost between isolates. Caching the client
 * risks stale credentials or memory leaks in edge runtimes, and the S3Client
 * is lightweight enough that creating a new instance per request is fine.
 */
function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Generate a presigned upload URL for R2. Returns { uploadUrl, publicUrl }. */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
  contentLength?: number,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;

  if (!bucket || !publicBase) {
    throw new Error("R2_BUCKET_NAME and R2_PUBLIC_URL must be set.");
  }

  const key = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
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

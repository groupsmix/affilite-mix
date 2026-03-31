/**
 * Cloudflare R2 media upload helper.
 *
 * Uses the S3-compatible API via presigned URLs so the admin browser
 * uploads directly to R2 — the Next.js server never handles the file bytes.
 *
 * Audit finding 5.1 (LOW): Replaced @aws-sdk/client-s3 (~26 MB) with
 * aws4fetch (~12 KB, zero dependencies) for a major bundle size reduction.
 * aws4fetch provides AWS Signature V4 signing which is all we need for
 * R2's S3-compatible presigned PUT URLs.
 *
 * Required env vars (all server-only):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { AwsClient } from "aws4fetch";

let cachedR2Client: AwsClient | null = null;

function getR2Client(): AwsClient {
  if (cachedR2Client) return cachedR2Client;

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  }

  cachedR2Client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });

  return cachedR2Client;
}

/** Generate a presigned upload URL for R2. Returns { uploadUrl, publicUrl }. */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;

  if (!accountId || !bucket || !publicBase) {
    throw new Error("R2_ACCOUNT_ID, R2_BUCKET_NAME and R2_PUBLIC_URL must be set.");
  }

  const key = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  const client = getR2Client();

  // Build the R2 endpoint URL for this object
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;

  // Sign a PUT request to generate a presigned URL (valid for 5 minutes)
  const expiresIn = 300;
  const url = new URL(endpoint);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));

  const signed = await client.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );

  const uploadUrl = signed.url;
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

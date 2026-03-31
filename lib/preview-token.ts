import { SignJWT, jwtVerify } from "jose";
import { requireEnvInProduction } from "@/lib/env";
import { randomUUID } from "crypto";

const devFallback = randomUUID() + randomUUID();
const JWT_SECRET = requireEnvInProduction("JWT_SECRET", devFallback);

/** Preview tokens expire after 1 hour */
const PREVIEW_TOKEN_EXPIRY = "1h";

function getSecretKey() {
  return new TextEncoder().encode(JWT_SECRET);
}

export interface PreviewTokenPayload {
  slug: string;
  contentType: string;
  siteId: string;
}

/**
 * Generate a short-lived preview token for a specific content slug.
 * Can be shared with non-admin reviewers.
 */
export async function generatePreviewToken(
  payload: PreviewTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload, purpose: "content-preview" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PREVIEW_TOKEN_EXPIRY)
    .setAudience("affiliate-platform-preview")
    .setIssuer("affiliate-platform")
    .sign(getSecretKey());
}

/**
 * Validate a preview token and return its payload.
 * Returns null if the token is invalid or expired.
 */
export async function validatePreviewToken(
  token: string,
): Promise<PreviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      audience: "affiliate-platform-preview",
      issuer: "affiliate-platform",
    });

    if (payload.purpose !== "content-preview") return null;

    const slug = payload.slug;
    const contentType = payload.contentType;
    const siteId = payload.siteId;

    if (typeof slug !== "string" || typeof contentType !== "string" || typeof siteId !== "string") {
      return null;
    }

    return { slug, contentType, siteId };
  } catch {
    return null;
  }
}

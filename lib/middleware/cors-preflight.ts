/**
 * CORS preflight handling extracted from middleware.ts (R-019 / E3#22).
 *
 * Responds to OPTIONS requests for /api/* routes with proper allow-lists
 * derived from static config and KV-cached site data.
 */

import { NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { getAllowedOrigins, type VerifiedSiteRef } from "@/lib/security/allowed-origins";
import { getAppCacheKV } from "@/lib/runtime-env";
import { CSRF_HEADER } from "@/lib/csrf";
import { TRACE_ID_HEADER } from "@/lib/trace-id";

const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOWED_HEADERS = [CSRF_HEADER, "Content-Type", "Authorization", TRACE_ID_HEADER].join(
  ", ",
);
const CORS_MAX_AGE = "3600";

/**
 * Handle an OPTIONS preflight request for an /api/* path.
 *
 * Resolution order:
 *   1. Static config lookup (fast)
 *   2. KV cache lookup for custom domains
 *
 * Returns 204 with CORS headers if the origin is allowed, 403 otherwise.
 */
export async function handleCorsPreflight(
  hostname: string,
  requestOrigin: string,
): Promise<NextResponse> {
  const staticSite = getSiteByDomain(hostname);
  let verifiedSite: VerifiedSiteRef | null = staticSite
    ? { slug: staticSite.id, domain: staticSite.domain, aliases: staticSite.aliases }
    : null;

  if (!verifiedSite) {
    try {
      const kv = getAppCacheKV();
      if (kv) {
        const cachedRow = (await kv.get(`site-domain:${hostname}`, "json")) as {
          slug?: string;
          is_active?: boolean;
        } | null;
        if (cachedRow?.slug && cachedRow?.is_active) {
          verifiedSite = { slug: cachedRow.slug, domain: hostname };
        }
      }
    } catch {
      // KV errors during preflight are non-fatal
    }
  }

  const allowedOrigins = getAllowedOrigins(verifiedSite);
  const matchedOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : "";

  if (!matchedOrigin) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": matchedOrigin,
      "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": CORS_MAX_AGE,
      Vary: "Origin",
    },
  });
}

export { CORS_ALLOWED_METHODS, CORS_ALLOWED_HEADERS, CORS_MAX_AGE };

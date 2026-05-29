import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { getAllowedOrigins, type VerifiedSiteRef } from "@/lib/security/allowed-origins";
import { getAppCacheKV } from "@/lib/runtime-env";
import { CSRF_HEADER } from "@/lib/csrf";
import { TRACE_ID_HEADER } from "@/lib/trace-id";
import type { MiddlewareContext } from "./compose";

const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOWED_HEADERS = [CSRF_HEADER, "Content-Type", "Authorization", TRACE_ID_HEADER].join(
  ", ",
);
const CORS_MAX_AGE = "3600";

/**
 * H-4: CORS preflight handler.
 * Responds to OPTIONS requests early with the correct allow-list.
 */
export async function withCorsPreflight(
  request: NextRequest,
  ctx: MiddlewareContext,
): Promise<NextResponse | null> {
  const { pathname, hostname, signal } = ctx;

  if (request.method !== "OPTIONS" || !pathname.startsWith("/api/")) {
    return null;
  }

  const requestOrigin = request.headers.get("origin") ?? "";

  // P1-10: Resolve site identity for preflight from static config + KV cache
  const preflightStaticSite = getSiteByDomain(hostname);
  let preflightVerifiedSite: VerifiedSiteRef | null = preflightStaticSite
    ? {
        slug: preflightStaticSite.id,
        domain: preflightStaticSite.domain,
        aliases: preflightStaticSite.aliases,
      }
    : null;

  // P1-10: For custom domains not in static config, check KV cache
  if (!preflightVerifiedSite) {
    try {
      const kv = getAppCacheKV();
      if (kv && !signal?.aborted) {
        const cachedRow = (await kv.get(`site-domain:${hostname}`, "json")) as {
          slug?: string;
          is_active?: boolean;
        } | null;
        if (cachedRow?.slug && cachedRow?.is_active) {
          preflightVerifiedSite = { slug: cachedRow.slug, domain: hostname };
        }
      }
    } catch {
      // KV errors during preflight are non-fatal
    }
  }

  const allowedOrigins = getAllowedOrigins(preflightVerifiedSite);
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

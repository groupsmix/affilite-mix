import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STREAMING_ALLOWLIST = new Set(["/api/admin/upload"]);
const STATIC_ASSET_PATH_RE =
  /^(?:\/_next\/static\/|\/(?:favicon\.ico|robots\.txt|sitemap\.xml)|.*\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|map))$/i;

/**
 * Reject excessively large request bodies early to prevent Worker CPU
 * and memory exhaustion. Returns an error response if the body exceeds
 * the limit, or null if the request is acceptable.
 */
export function checkBodySize(request: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(request.method)) return null;

  const { pathname } = request.nextUrl;
  const contentLength = request.headers.get("content-length");
  const transferEncoding = (request.headers.get("transfer-encoding") || "").toLowerCase();

  if (!contentLength && transferEncoding.includes("chunked")) {
    return new NextResponse(JSON.stringify({ error: "Length required", code: "LENGTH_REQUIRED" }), {
      status: 411,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!contentLength && !STREAMING_ALLOWLIST.has(pathname)) {
    return new NextResponse(JSON.stringify({ error: "Length required", code: "LENGTH_REQUIRED" }), {
      status: 411,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (contentLength) {
    const parsed = parseInt(contentLength, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return new NextResponse(
        JSON.stringify({ error: "Invalid Content-Length", code: "BAD_REQUEST" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (parsed > MAX_BODY_BYTES) {
      return new NextResponse(
        JSON.stringify({ error: "Payload too large", code: "PAYLOAD_TOO_LARGE" }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return null;
}

/**
 * Apply security headers to the response. Called after the response is
 * created so all headers are in one place.
 */
export function applySecurityHeaders(
  response: NextResponse,
  opts: {
    pathname: string;
    gpcEnabled: boolean;
    cspHeaderValue: string | null;
    traceId: string;
  },
): void {
  const { pathname, gpcEnabled, cspHeaderValue, traceId } = opts;

  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // AUDIT-11: authoritative per-request Permissions-Policy. Kept byte-for-byte
  // identical to the static copy in next.config.ts so the two layers cannot
  // emit divergent policies depending on header precedence. `interest-cohort=()`
  // (G-51) opts out of FLoC / Topics.
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  // F11-01: Spectre-class / cross-origin-leak hardening
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set(TRACE_ID_HEADER_NAME, traceId);

  if (gpcEnabled) {
    response.headers.set("x-gpc", "1");
  }

  if (pathname.startsWith("/api/admin/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isStaticAsset = STATIC_ASSET_PATH_RE.test(pathname);

  if (isStaticAsset) {
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  } else if (!isApiRoute && !pathname.startsWith("/q7m-k4j9")) {
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    }
  }

  response.headers.append("Vary", "Cookie");
  response.headers.append("Vary", "x-site-id, host");

  if (cspHeaderValue) {
    response.headers.set("Content-Security-Policy", cspHeaderValue);
  }
}

const TRACE_ID_HEADER_NAME = "x-trace-id";

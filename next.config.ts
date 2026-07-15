import type { NextConfig } from "next";
import { allSites } from "./config/sites";
import { API_VERSION_HEADER, CURRENT_API_VERSION } from "./lib/api-version";

// G-03 / G-04: pin remotePatterns to the exact Supabase subdomain + exact
// R2 public host rather than the historical `*.supabase.co` / `*.r2.dev`
// wildcards. If an env var is missing the corresponding pattern is simply
// omitted — no wildcard string ever ships in the bundle. Production
// always resolves to exact hosts because both env vars are set via
// `wrangler secret` and asserted by deploy.yml.
function hostnameFromEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    // fail-open: malformed URL returns null; caller treats as no origin
    return null;
  }
}

const supabaseHostname = hostnameFromEnv("NEXT_PUBLIC_SUPABASE_URL");
const r2PublicHostname = hostnameFromEnv("R2_PUBLIC_URL");

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    formats: ["image/avif", "image/webp"],
    // F-006: harden the Next image optimizer while it still proxies
    // third-party (Amazon) product images, i.e. until the R2 ingest
    // migration (G-48) rewrites existing image_url rows.
    //   - dangerouslyAllowSVG stays explicitly false: never optimize or
    //     serve an SVG fetched from a remote host (SVGs can carry script).
    //   - contentDispositionType "attachment": a direct request to
    //     /_next/image downloads rather than renders inline, so a malicious
    //     upstream payload cannot be content-sniffed into an active document.
    //     (<img> rendering is unaffected — only direct navigation is.)
    //   - qualities pinned to the single default value: bounds optimizer
    //     cache/fetch fan-out so a crawler cannot force dozens of distinct
    //     re-optimisations (and upstream re-fetches) of the same image via
    //     ?q=1..100. No call site passes a custom `quality` prop.
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
    qualities: [75],
    // F-006: bound upstream re-fetch amplification. Every distinct
    // /_next/image request that misses cache forces the Worker to fetch the
    // full source image from the upstream host (incl. the still-allowlisted
    // Amazon CDNs) and re-optimise it. Product images are effectively
    // immutable, so pin a long minimum cache TTL (30 days): once a given
    // (url, width, format) variant is optimised it is served from cache and
    // NOT re-fetched upstream for the TTL window. This closes the bandwidth
    // half of F-006 across the width axis the way `qualities: [75]` closed
    // the quality axis. The SSRF half remains bounded by the exact-host
    // remotePatterns below; full closure still depends on the G-48 R2 ingest
    // migration removing the Amazon hosts entirely.
    minimumCacheTTL: 2_592_000, // 30 days, in seconds
    remotePatterns: [
      // G-04: Cloudflare R2 public bucket, pinned to the exact hostname
      // served from R2_PUBLIC_URL. Omitted when the env var is unset
      // (local dev without R2 configured).
      ...(r2PublicHostname ? [{ protocol: "https" as const, hostname: r2PublicHostname }] : []),
      // G-03: Supabase storage, pinned to our project subdomain. Omitted
      // when NEXT_PUBLIC_SUPABASE_URL is unset.
      ...(supabaseHostname ? [{ protocol: "https" as const, hostname: supabaseHostname }] : []),
      // Site domains (for OG images, etc.) — derived from config/sites/
      ...allSites.map((site) => ({ protocol: "https" as const, hostname: site.domain })),
      // F-01: Restrict to exact known image CDNs. Ingest/proxy third-party
      // images into R2 with size validation instead of allowing arbitrary hosts.
      // G-48 (follow-up): Amazon CDN hostnames stay until R2 ingest migration
      // rewrites existing product image_url rows.
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
    ],
  },
  // Redirect the common plural spellings of content-type routes to their
  // canonical singular slugs (routes resolve via /[contentType], where the
  // slugs are singular: review/comparison/guide). Nav labels are plural
  // ("Reviews"/"Comparisons"/"Guides"), so users and inbound links guess the
  // plural and would otherwise hit a 404.
  redirects: async () => [
    { source: "/reviews", destination: "/review", permanent: true },
    { source: "/reviews/:slug", destination: "/review/:slug", permanent: true },
    { source: "/comparisons", destination: "/comparison", permanent: true },
    { source: "/comparisons/:slug", destination: "/comparison/:slug", permanent: true },
    { source: "/guides", destination: "/guide", permanent: true },
    { source: "/guides/:slug", destination: "/guide/:slug", permanent: true },
  ],
  // Cloudflare Pages deployment via @opennextjs/cloudflare
  headers: async () => [
    {
      source: "/api/:path*",
      headers: [{ key: API_VERSION_HEADER, value: CURRENT_API_VERSION }],
    },
    {
      // FP-01: stricter Referrer-Policy on the password-reset route so the
      // reset token in the query string cannot leak via the Referer header.
      source: "/q7m-k4j9/reset-password",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
      ],
    },
    // audit-etap1 #20: belt-and-suspenders CSP fallback for paths that are
    // EXPLICITLY EXCLUDED from the middleware matcher. The matcher in
    // `middleware.ts` excludes (`_next/static`, `_next/image`, `favicon.ico`,
    // `api/internal/`). For those paths, no per-request nonced CSP
    // is set. They are opaque binary or internal-only — `default-src 'none'`
    // is the safest fallback because the browser will refuse to execute or
    // fetch anything from those responses anyway. Source patterns intentionally
    // do not overlap with the middleware matcher, so no duplicate CSP header
    // can be emitted on the same response.
    //
    // Tested by `__tests__/csp.test.ts` which asserts every excluded path
    // returns `default-src 'none'` and exactly one CSP header.
    ...[
      "/_next/static/:path*",
      "/_next/image",
      "/_next/image/:path*",
      "/favicon.ico",
      "/fonts/:path*",
      "/api/internal/:path*",
    ].map((source) => ({
      source,
      headers: [
        {
          key: "Content-Security-Policy",
          value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      ],
    })),
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          // AUDIT-11: keep this byte-for-byte identical to the per-request
          // policy set by `applySecurityHeaders` in lib/middleware-helpers.ts.
          // Both layers can set this header (next.config covers routes the
          // middleware matcher excludes); if they diverge, whichever wins the
          // precedence race silently drops directives. Unified value below.
          // G-51: `interest-cohort=()` opts out of FLoC / Topics.
          value:
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // G-27: the previous static CSP fallback has been removed. Every
        // request that matters (app routes, API routes, admin UI, public
        // pages) flows through `middleware.ts`, which sets a per-request
        // nonced CSP via `lib/csp.ts`. Routes explicitly excluded from the
        // middleware matcher are now handled by the `default-src 'none'`
        // entries above (audit-etap1 #20).
      ],
    },
  ],
};

export default nextConfig;

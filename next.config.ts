import type { NextConfig } from "next";
import { allSites } from "./config/sites";

// G-03 / G-04: pin remotePatterns and static CSP fallback to the
// exact Supabase subdomain + exact R2 public host rather than the
// historical `*.supabase.co` / `*.r2.dev` wildcards.
const supabaseHostname = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) {
    try {
      return new URL(raw).hostname;
    } catch {
      /* fallthrough to wildcard */
    }
  }
  return "*.supabase.co";
})();

const r2PublicHostname = (() => {
  const raw = process.env.R2_PUBLIC_URL;
  if (raw) {
    try {
      return new URL(raw).hostname;
    } catch {
      /* fallthrough to wildcard */
    }
  }
  return null;
})();

const r2RemotePatterns = r2PublicHostname
  ? [{ protocol: "https" as const, hostname: r2PublicHostname }]
  : [
      // Dev / preview fallback. Production MUST set R2_PUBLIC_URL so the
      // exact-host pin kicks in; deploy.yml asserts this.
      { protocol: "https" as const, hostname: "*.r2.dev" },
      { protocol: "https" as const, hostname: "*.r2.cloudflarestorage.com" },
    ];

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // G-04: Cloudflare R2 public bucket, pinned to the exact hostname
      // served from R2_PUBLIC_URL when it is set. In production we always
      // resolve to a single exact host; the wildcard fallback applies only
      // in dev / preview before the env var is materialised.
      ...r2RemotePatterns,
      // G-03: Supabase storage, pinned to our project subdomain.
      { protocol: "https", hostname: supabaseHostname },
      // Site domains (for OG images, etc.) — derived from config/sites/
      ...allSites.map((site) => ({ protocol: "https" as const, hostname: site.domain })),
      // Common affiliate product image CDNs
      // G-48 (LCP): m.media-amazon.com / images-na.ssl-images-amazon.com are
      // third-party origins outside our control — slow TTFB hurts LCP and we
      // cannot apply long-cache headers. Long-term plan: copy product images
      // to our R2 bucket on ingest and serve them via Image Resizing.
      // Short-term mitigation lives in the consuming components (non-LCP
      // slots use priority={false} + loading="lazy"; see G-48 comments in
      // app/(public)/components/product-card.tsx etc.).
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
      { protocol: "https", hostname: "www.google.com" },
    ],
  },
  // Cloudflare Pages deployment via @opennextjs/cloudflare
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          // G-51: include `interest-cohort=()` to opt out of FLoC / Topics.
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // G-27: the previous static CSP fallback has been removed. Every
        // request that matters (app routes, API routes, admin UI, public
        // pages) flows through `middleware.ts`, which sets a per-request
        // nonced CSP via `lib/csp.ts`. The static fallback was only ever
        // hit on routes explicitly excluded from the middleware matcher
        // (`_next/static`, `_next/image`, `favicon.ico`, `fonts/`,
        // `api/internal/`). Those responses are either opaque binary
        // assets or internal-only endpoints that never return HTML, so
        // they do not need a CSP header. Removing the fallback removes a
        // class of "two CSP headers on one response" bugs that were
        // silently disabling our nonce-based policy on some code paths.
        // `__tests__/csp.test.ts` asserts exactly one CSP header is
        // emitted on user-facing routes.
      ],
    },
  ],
};

export default nextConfig;

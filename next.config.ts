import type { NextConfig } from "next";
import { allSites } from "./config/sites";

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
    return null;
  }
}

const supabaseHostname = hostnameFromEnv("NEXT_PUBLIC_SUPABASE_URL");
const r2PublicHostname = hostnameFromEnv("R2_PUBLIC_URL");

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    formats: ["image/avif", "image/webp"],
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
          // A56.5 / G-51: comprehensive deny-all Permissions-Policy, aligned
          // with the runtime policy set in middleware.ts. Static routes
          // excluded from the middleware matcher (fonts, _next/static, etc.)
          // still get this header from Next.js's built-in headers() config.
          value:
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=(), browsing-topics=(), attribution-reporting=(), document-domain=(), idle-detection=(), midi=(), otp-credentials=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), web-share=(), window-management=(), xr-spatial-tracking=(), hid=(), gamepad=()",
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

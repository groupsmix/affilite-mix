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
      // Common affiliate product image CDNs.
      // G-48 (follow-up): m.media-amazon.com / images-na.ssl-images-amazon.com
      // stay here until the R2 ingest migration rewrites existing
      // product image_url rows to the R2 public bucket. Removing them
      // earlier would break next/image on any product still pointing
      // at an Amazon CDN URL.
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

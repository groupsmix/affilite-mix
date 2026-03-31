import type { NextConfig } from "next";
import { allSites } from "./config/sites";

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket (custom domain or default)
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      // Supabase storage
      { protocol: "https", hostname: "*.supabase.co" },
      // Site domains (for OG images, etc.) — derived from config/sites/
      ...allSites.map((site) => ({ protocol: "https" as const, hostname: site.domain })),
      // Common affiliate product image CDNs
      { protocol: "https", hostname: "images.unsplash.com" },
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
          value: "camera=(), microphone=(), geolocation=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            // Next.js requires 'unsafe-inline' for its runtime styles injected
            // via <style> tags. True nonce-based CSP for styles needs a custom
            // Document with per-request nonces, which is incompatible with
            // Cloudflare Pages static headers. We keep 'strict-dynamic' for
            // scripts so only our entry-point script (and anything it loads)
            // can execute — this is a meaningful upgrade over bare
            // 'unsafe-inline' because it blocks injected <script> tags.
            "script-src 'self' 'strict-dynamic' https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https: blob:",
            "connect-src 'self' https://*.supabase.co https://api.coingecko.com https://challenges.cloudflare.com",
            "frame-src https://challenges.cloudflare.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;

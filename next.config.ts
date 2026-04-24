import type { NextConfig } from "next";
import { allSites } from "./config/sites";

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    formats: ["image/avif", "image/webp"],
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
          value: "camera=(), microphone=(), geolocation=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // Content-Security-Policy is issued per-request by middleware.ts so
        // we can embed a nonce into `script-src` / `style-src` (H-10).
        // A static CSP header is still applied to routes that middleware
        // does not match (see the matcher in middleware.ts — _next/static,
        // _next/image, favicon.ico, fonts/, api/internal/) to keep a
        // conservative default.
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https: blob:",
            "font-src 'self' https://fonts.gstatic.com",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Restrict external images to known sources (R2 bucket, Supabase storage, site domains)
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket (custom domain or default)
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      // Supabase storage
      { protocol: "https", hostname: "*.supabase.co" },
      // Site domains (for OG images, etc.)
      { protocol: "https", hostname: "arabic.wristnerd.site" },
      { protocol: "https", hostname: "wristnerd.site" },
      // Common affiliate product image CDNs
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "m.media-amazon.com" },
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
            "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
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

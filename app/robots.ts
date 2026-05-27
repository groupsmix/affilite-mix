import type { MetadataRoute } from "next";
import { allSites } from "@/config/sites";

const DEFAULT_DOMAIN = allSites[0]?.domain ?? "example.com";

/** AI-training crawlers that should be blocked site-wide (A113-F2). */
const AI_TRAINING_BOTS = [
  "GPTBot",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "Claude-Web",
  "Bytespider",
  "cohere-ai",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  let domain = DEFAULT_DOMAIN;
  try {
    const { getCurrentSite } = await import("@/lib/site-context");
    const site = await getCurrentSite();
    domain = site.domain;
  } catch {
    // fail-open: best-effort
  }

  return {
    rules: [
      ...AI_TRAINING_BOTS.map((bot) => ({
        userAgent: bot,
        disallow: ["/"],
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/r/",
          "/newsletter/confirm",
          "/newsletter/unsubscribe",
          "/*?*preview=*",
        ],
      },
    ],
    sitemap: `https://${domain}/sitemap.xml`,
  };
}

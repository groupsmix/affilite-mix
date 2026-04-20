import type { MetadataRoute } from "next";
import { allSites } from "@/config/sites";

const DEFAULT_DOMAIN = allSites[0]?.domain ?? "example.com";

export default async function robots(): Promise<MetadataRoute.Robots> {
  let domain = DEFAULT_DOMAIN;
  try {
    const { getCurrentSite } = await import("@/lib/site-context");
    const site = await getCurrentSite();
    domain = site.domain;
  } catch {
    // Fallback to first configured domain when DB/site context is unavailable
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    sitemap: `https://${domain}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getCurrentSite();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: site.seo.robotsDisallow,
    },
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}

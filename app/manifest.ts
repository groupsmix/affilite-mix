import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getCurrentSite();

  // Read per-site theme color from DB, falling back to config
  let themeColor = site.theme.accentColor;
  let siteName = site.name;
  let siteDescription = site.brand.description;

  try {
    const dbSite = await resolveDbSiteBySlug(site.id);
    if (dbSite) {
      const t = dbSite.theme as Record<string, string> | null;
      if (t?.accent_color) themeColor = t.accent_color;
      if (t?.primary_color) themeColor = t.primary_color;
      if (dbSite.name) siteName = dbSite.name;
      if (dbSite.meta_description) siteDescription = dbSite.meta_description;
    }
  } catch {
    // Use config values
  }

  return {
    name: siteName,
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16",
        type: "image/x-icon",
      },
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}

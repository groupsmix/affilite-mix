import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { shouldSkipDbCall } from "@/lib/db-available";
import { isStaticConfigSite } from "@/lib/site-config-authority";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getCurrentSite();

  // Database-managed tenants read branding from their row. Static tenants use
  // config/sites exclusively.
  let themeColor = site.theme.accentColor;
  let siteName = site.name;
  let siteDescription = site.brand.description;

  if (!shouldSkipDbCall() && !isStaticConfigSite(site)) {
    try {
      const dbSite = await getSiteRowByDomain(site.domain);
      if (dbSite) {
        const t = dbSite.theme as Record<string, string> | null;
        if (t?.accent_color) themeColor = t.accent_color;
        if (t?.primary_color) themeColor = t.primary_color;
        if (dbSite.name) siteName = dbSite.name;
        if (dbSite.meta_description) siteDescription = dbSite.meta_description;
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Use config values
    }
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

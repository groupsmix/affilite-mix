import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getCurrentSite();

  return {
    name: site.name,
    short_name: site.name,
    description: site.brand.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: site.theme.accentColor,
    icons: [
      {
        src: site.brand.faviconUrl || "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

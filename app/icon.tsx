import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { shouldSkipDbCall } from "@/lib/db-available";
import { safeFetch } from "@/lib/ssrf-guard";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const site = await getCurrentSite();

  // Check for custom favicon_url from DB
  if (!shouldSkipDbCall()) {
    try {
      const dbSite = await resolveDbSiteBySlug(site.id);
      if (dbSite?.favicon_url) {
        // Fetch and return the custom favicon
        const res = await safeFetch(dbSite.favicon_url);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          return new Response(buffer, {
            headers: { "Content-Type": "image/png" },
          });
        }
      }
    } catch {
      // Fall through to generated icon
    }
  }

  // Read per-site primary color from DB theme, falling back to config
  let bgColor = site.theme.primaryColor || "#1B2A4A";
  if (!shouldSkipDbCall()) {
    try {
      const dbSite = await resolveDbSiteBySlug(site.id);
      if (dbSite) {
        const t = dbSite.theme as Record<string, string> | null;
        if (t?.primary_color) bgColor = t.primary_color;
      }
    } catch {
      // Use config color
    }
  }

  const letter = site.name.charAt(0).toUpperCase();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bgColor,
        borderRadius: "6px",
        color: "#ffffff",
        fontSize: "20px",
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      {letter}
    </div>,
    { ...size },
  );
}

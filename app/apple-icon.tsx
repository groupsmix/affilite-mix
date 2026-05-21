import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { shouldSkipDbCall } from "@/lib/db-available";

import { safeFetch } from "@/lib/ssrf-guard";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const site = await getCurrentSite();

  // Check for custom favicon_url from DB (used for apple-icon too)
  if (!shouldSkipDbCall()) {
    try {
      const dbSite = await resolveDbSiteBySlug(site.id);
      if (dbSite?.favicon_url) {
        const res = await safeFetch(dbSite.favicon_url);
        if (res.ok) {
          const cType = res.headers.get("content-type");
          if (!cType?.startsWith("image/")) throw new Error("Invalid content type");

          const buffer = await res.arrayBuffer();
          if (buffer.byteLength > 2 * 1024 * 1024) throw new Error("Favicon too large");

          return new Response(buffer, {
            headers: { "Content-Type": cType },
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
        borderRadius: "36px",
        color: "#ffffff",
        fontSize: "110px",
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      {letter}
    </div>,
    { ...size },
  );
}

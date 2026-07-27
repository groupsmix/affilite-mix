import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { shouldSkipDbCall } from "@/lib/db-available";
import { isStaticConfigSite } from "@/lib/site-config-authority";
import { safeFetch } from "@/lib/ssrf-guard";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const site = await getCurrentSite();

  // Single DB call for both favicon and theme color (was two separate calls).
  const dbSite =
    !shouldSkipDbCall() && !isStaticConfigSite(site)
      ? await getSiteRowByDomain(site.domain).catch(() => null)
      : null;

  const faviconUrl = dbSite?.favicon_url || site.brand.faviconUrl;

  // Check for custom favicon_url from DB or static config
  if (faviconUrl) {
    try {
      const faviconUrlAbsolute = faviconUrl.startsWith("http")
        ? faviconUrl
        : new URL(faviconUrl, `https://${site.domain}`).toString();
      const res = await safeFetch(faviconUrlAbsolute);
      if (res.ok) {
        const cType = res.headers.get("content-type");
        if (!cType?.startsWith("image/")) throw new Error("Invalid content type");

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 2 * 1024 * 1024) throw new Error("Favicon too large");

        return new Response(buffer, {
          headers: {
            "Content-Type": cType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    } catch {
      // fail-open: best-effort
      // Fall through to generated icon
    }
  }

  // Read per-site primary color from DB theme, falling back to config
  let bgColor = site.theme.primaryColor || "#1B2A4A";
  if (dbSite) {
    const t = dbSite.theme as Record<string, string> | null;
    if (t?.primary_color) bgColor = t.primary_color;
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

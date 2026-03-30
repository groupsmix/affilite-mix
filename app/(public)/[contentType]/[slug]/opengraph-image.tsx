import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug } from "@/lib/dal/content";

export const runtime = "edge";
export const alt = "Content preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Auto-generated OpenGraph image for content pages.
 * Falls back to a branded image with the content title and site accent color
 * when no custom OG image is set on the content item.
 */
export default async function OgImage({
  params,
}: {
  params: Promise<{ contentType: string; slug: string }>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const content = await getContentBySlug(site.id, slug);

  if (!content) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#f9fafb",
            color: "#1e293b",
            fontSize: 48,
            fontWeight: 700,
          }}
        >
          Not Found
        </div>
      ),
      { ...size },
    );
  }

  // If the content already has a custom OG image, skip generation
  // (Next.js metadata will use the custom URL instead)
  const accentColor = site.theme.accentColor || "#10B981";
  const primaryColor = site.theme.primaryColor || "#1E293B";

  const contentTypeLabel =
    site.contentTypes.find((ct) => ct.value === content.type)?.label ??
    content.type;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: primaryColor,
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Accent bar at top */}
        <div
          style={{
            display: "flex",
            width: "120px",
            height: "6px",
            backgroundColor: accentColor,
            borderRadius: "3px",
            marginBottom: "32px",
          }}
        />

        {/* Content type badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "2px",
              color: accentColor,
            }}
          >
            {contentTypeLabel}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          <h1
            style={{
              fontSize: content.title.length > 60 ? "42px" : "56px",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.2,
              margin: 0,
              maxWidth: "900px",
            }}
          >
            {content.title}
          </h1>
        </div>

        {/* Footer with site name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {site.name}
          </span>
          {content.author && (
            <span
              style={{
                fontSize: "18px",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              by {content.author}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}

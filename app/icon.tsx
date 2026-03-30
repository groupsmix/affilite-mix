import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const site = await getCurrentSite();
  const letter = site.name.charAt(0).toUpperCase();
  const bgColor = site.theme.primaryColor || "#111827";

  return new ImageResponse(
    (
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
        }}
      >
        {letter}
      </div>
    ),
    { ...size },
  );
}

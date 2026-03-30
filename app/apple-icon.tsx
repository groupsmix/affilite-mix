import { ImageResponse } from "next/og";
import { getCurrentSite } from "@/lib/site-context";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const site = await getCurrentSite();
  const letter = site.name.charAt(0).toUpperCase();
  const bgColor = site.theme.primaryColor || "#1B2A4A";

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
          borderRadius: "36px",
          color: "#ffffff",
          fontSize: "110px",
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {letter}
      </div>
    ),
    { ...size },
  );
}

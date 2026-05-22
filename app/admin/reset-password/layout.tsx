import type { Metadata, Viewport } from "next";

// FP-01 fix: Prevent the reset token (in URL query string) from leaking via
// the Referer header when the user clicks any external link on this page,
// or when assets/embeds make outbound requests. Overrides the app-wide
// `strict-origin-when-cross-origin` default with the stricter `no-referrer`
// only for the reset-password route.
export const metadata: Metadata = {
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="referrer" content="no-referrer" />
      {children}
    </>
  );
}

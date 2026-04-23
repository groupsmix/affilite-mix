import type { Metadata } from "next";

/**
 * Root metadata for all /admin/* routes (including /admin/login).
 * Belt-and-braces noindex: the robots.ts disallow list and per-sublayout
 * metadata both cover this too, but having a layout-level metadata
 * guarantees every admin page emits a noindex meta tag.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

/**
 * Root admin layout — applies to both /admin/login and /admin/(dashboard)/*.
 *
 * Centralizes noindex/noarchive metadata so search engines never list any
 * admin surface area, including the login page itself.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

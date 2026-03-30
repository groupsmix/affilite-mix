import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { AdminSidebar } from "@/app/admin/(dashboard)/components/admin-sidebar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  // Set CSS variables from active site so admin components can use theme colors
  const activeSiteSlug = await getActiveSiteSlug();
  const activeSite = activeSiteSlug ? getSiteById(activeSiteSlug) : null;
  const cssVars = activeSite
    ? ({
        "--color-primary": activeSite.theme.primaryColor,
        "--color-accent": activeSite.theme.accentColor,
      } as React.CSSProperties)
    : undefined;

  const direction = activeSite?.direction ?? "ltr";
  const lang = activeSite?.language ?? "en";

  return (
    <div dir={direction} lang={lang} className="flex min-h-screen bg-gray-50" style={cssVars}>
      <AdminSidebar />
      <main className="flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}

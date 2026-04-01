import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { AdminSidebar } from "@/app/admin/(dashboard)/components/admin-sidebar";
import { TokenRefresh } from "@/app/admin/(dashboard)/components/token-refresh";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  // Set CSS variables from active site so admin components can use theme colors.
  // Supports both static-config sites and DB-only sites created via admin panel.
  const activeSiteSlug = await getActiveSiteSlug();
  let siteName: string | null = null;
  let direction: "ltr" | "rtl" = "ltr";
  let lang = "en";
  let cssVars: React.CSSProperties | undefined;

  if (activeSiteSlug) {
    const staticSite = getSiteById(activeSiteSlug);
    if (staticSite) {
      siteName = staticSite.name;
      direction = staticSite.direction;
      lang = staticSite.language;
      cssVars = {
        "--color-primary": staticSite.theme.primaryColor,
        "--color-accent": staticSite.theme.accentColor,
      } as React.CSSProperties;
    } else {
      // DB-only site — fetch from database
      const dbSite = await getSiteRowBySlug(activeSiteSlug);
      if (dbSite) {
        siteName = dbSite.name;
        direction = dbSite.direction;
        lang = dbSite.language;
        const theme = dbSite.theme as Record<string, string> | null;
        cssVars = {
          "--color-primary": theme?.primary_color ?? theme?.primaryColor ?? "#1f2937",
          "--color-accent": theme?.accent_color ?? theme?.accentColor ?? "#3b82f6",
        } as React.CSSProperties;
      }
    }
  }

  return (
    <div dir={direction} lang={lang} className="flex min-h-screen bg-gray-50" style={cssVars}>
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
      >
        {lang === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
      </a>
      <AdminSidebar siteName={siteName} />
      <TokenRefresh />
      <Toaster position="top-right" richColors closeButton containerAriaLabel="Notifications" />
      <main id="admin-main" className="flex-1 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}

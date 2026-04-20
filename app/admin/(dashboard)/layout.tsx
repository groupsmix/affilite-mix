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
  let monetizationType: "affiliate" | "ads" | "both" | null = null;

  if (activeSiteSlug) {
    const staticSite = getSiteById(activeSiteSlug);
    if (staticSite) {
      siteName = staticSite.name;
      direction = staticSite.direction;
      lang = staticSite.language;
      monetizationType = staticSite.monetizationType;
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
        monetizationType = dbSite.monetization_type ?? "affiliate";
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
      <AdminSidebar siteName={siteName} monetizationType={monetizationType} />
      <TokenRefresh />
      <Toaster position="top-right" richColors closeButton containerAriaLabel="Notifications" />
      <main id="admin-main" className="flex-1 p-6 lg:p-8">
        {/* Active-site context banner — always visible so the admin knows which site they're editing */}
        {siteName ? (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{
              borderColor: "var(--color-accent, #3b82f6)",
              backgroundColor: "color-mix(in srgb, var(--color-accent, #3b82f6) 8%, white)",
              color: "var(--color-primary, #1f2937)",
            }}
          >
            <span
              className="inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--color-accent, #3b82f6)" }}
            />
            Editing: {siteName}
            {activeSiteSlug && (
              <span className="text-xs font-normal text-gray-500">({activeSiteSlug})</span>
            )}
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800">
            <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
            No site selected — choose a site from the sidebar to continue.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

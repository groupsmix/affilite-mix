import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { AdminShell } from "@/components/admin/admin-shell";
import { TokenRefresh } from "@/app/admin/(dashboard)/components/token-refresh";
import { Toaster } from "sonner";

interface ResolvedActiveSite {
  slug: string | null;
  name: string | null;
  direction: "ltr" | "rtl";
  lang: string;
  cssVars: React.CSSProperties | undefined;
  monetizationType: "affiliate" | "ads" | "both" | null;
}

/**
 * Resolve the currently active site for the admin chrome.
 *
 * Supports both static-config sites (from `config/sites/*`) and DB-only sites
 * (created via the admin panel). The underlying readers — `getSiteById` (pure
 * in-memory lookup) and `getSiteRowBySlug` (in-memory TTL cache) — are cheap
 * and safe to call from both `generateMetadata` and the layout body; the DB
 * hit is memoized by the DAL cache.
 */
async function resolveActiveSite(): Promise<ResolvedActiveSite> {
  const slug = await getActiveSiteSlug();
  if (!slug) {
    return {
      slug: null,
      name: null,
      direction: "ltr",
      lang: "en",
      cssVars: undefined,
      monetizationType: null,
    };
  }

  const staticSite = getSiteById(slug);
  if (staticSite) {
    return {
      slug,
      name: staticSite.name,
      direction: staticSite.direction,
      lang: staticSite.language,
      cssVars: {
        "--color-primary": staticSite.theme.primaryColor,
        "--color-accent": staticSite.theme.accentColor,
      } as React.CSSProperties,
      monetizationType: staticSite.monetizationType,
    };
  }

  const dbSite = await getSiteRowBySlug(slug);
  if (dbSite) {
    const theme = dbSite.theme as Record<string, string> | null;
    return {
      slug,
      name: dbSite.name,
      direction: dbSite.direction,
      lang: dbSite.language,
      cssVars: {
        "--color-primary": theme?.primary_color ?? theme?.primaryColor ?? "#1f2937",
        "--color-accent": theme?.accent_color ?? theme?.accentColor ?? "#3b82f6",
      } as React.CSSProperties,
      monetizationType: dbSite.monetization_type ?? "affiliate",
    };
  }

  return {
    slug,
    name: null,
    direction: "ltr",
    lang: "en",
    cssVars: undefined,
    monetizationType: null,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const active = await resolveActiveSite();
  const brand = "Affilite-Mix Admin";
  const template = active.name ? `%s · ${active.name} · ${brand}` : `%s · ${brand}`;
  const defaultTitle = active.name ? `${active.name} · ${brand}` : brand;
  return {
    title: { template, default: defaultTitle },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const active = await resolveActiveSite();
  const isSuperAdmin = session.role === "super_admin";

  return (
    <div dir={active.direction} lang={active.lang} style={active.cssVars}>
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
      >
        {active.lang === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
      </a>
      <TokenRefresh />
      <Toaster position="top-right" richColors closeButton containerAriaLabel="Notifications" />
      <AdminShell
        siteName={active.name}
        monetizationType={active.monetizationType}
        isSuperAdmin={isSuperAdmin}
        hasActiveSite={active.slug !== null}
      >
        {children}
      </AdminShell>
    </div>
  );
}

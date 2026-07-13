import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { AdminShell } from "@/components/admin/admin-shell";
import { TokenRefresh } from "@/app/q7m-k4j9/(dashboard)/components/token-refresh";
import { StepUpDialog } from "@/lib/step-up-client";
import { Toaster } from "sonner";

// The authenticated admin dashboard renders per-user, per-tenant data that must
// always reflect the live database. Without this, admin pages can be served
// from the persisted Full Route Cache (which survives deploys on the Cloudflare
// OpenNext incremental cache), so pages that were rendered empty before a data
// fix — or before their tenant client was bound — keep showing stale empty
// tables (e.g. Users "No admin users yet", Categories "No categories yet")
// even though the underlying data and APIs are correct. Forcing dynamic
// rendering opts the whole admin subtree out of that cache.
export const dynamic = "force-dynamic";

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

  // getSiteRowBySlug throws on DB errors (anything but PGRST116). A transient
  // DB failure here would crash the entire admin shell (layout renders above
  // every dashboard route, so no inner error boundary can catch it). Degrade
  // to the neutral fallback branding below instead — same resilience pattern
  // as the dashboard cards (NicheHealthPanel / RevenuePerSiteCard).
  const dbSite = await getSiteRowBySlug(slug).catch(() => null);
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
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/q7m-k4j9/login");
  }

  const active = await resolveActiveSite();
  const isSuperAdmin = session.role === "super_admin";

  return (
    // The admin shell is an English LTR application surface. It must NOT inherit
    // the active *content* site's writing direction or language — otherwise
    // selecting an RTL or non-English tenant mirrors the entire admin chrome
    // (sidebar jumps right, layout reverses) and causes screen readers to apply
    // the wrong speech synthesis to the whole admin UI.
    //
    // Issue 12: pin lang="en" statically regardless of active.lang. Direction is
    // intentionally pinned to LTR here; per-field RTL for editing localized
    // content should be handled at the input level (e.g. dir="auto"). The site's
    // CSS variables (theme colours) are still applied via style={active.cssVars}.
    <div dir="ltr" lang="en" style={active.cssVars}>
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
      >
        {active.lang === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
      </a>
      <TokenRefresh />
      {/* F-030: re-auth prompt for step-up-gated destructive operations. */}
      <StepUpDialog />
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

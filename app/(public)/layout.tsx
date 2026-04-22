import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { shouldSkipDbCall } from "@/lib/db-available";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";
import { ThemeProvider } from "./components/theme-provider";
import type { SiteThemeConfig, LayoutVariant } from "./components/theme-provider";
import CookieConsentCmp from "./components/cookie-consent-cmp";
import { Toaster } from "sonner";
import { logger } from "@/lib/logger";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();

  // Pull per-niche SEO metadata + favicon from the DB site record
  let metaTitle: string | undefined;
  let metaDescription: string | undefined;
  let ogImageUrl: string | undefined;
  let dbFaviconUrl: string | undefined;
  if (!shouldSkipDbCall()) {
    try {
      const dbSite = await resolveDbSiteBySlug(site.id);
      if (dbSite) {
        metaTitle = dbSite.meta_title ?? undefined;
        metaDescription = dbSite.meta_description ?? undefined;
        ogImageUrl = (dbSite.og_image_url as string) ?? undefined;
        dbFaviconUrl = dbSite.favicon_url ?? undefined;
      }
    } catch (err) {
      logger.warn("Failed to load DB metadata for public layout, falling back to config", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Dynamic favicon: prefer DB favicon_url, then config, then default
  const finalFavicon = dbFaviconUrl || site.brand.faviconUrl || "/favicon.svg";

  return {
    title: metaTitle || site.name,
    description: metaDescription || `${site.name} — curated content and product recommendations`,
    icons: { icon: finalFavicon },
    ...(ogImageUrl && {
      openGraph: { images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    }),
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const site = await getCurrentSite();

  // Read DB row for dynamic theme overrides, nav items, and footer nav
  let dbTheme: Partial<SiteThemeConfig> = {};
  let dbNavItems: { label: string; href: string; icon?: string }[] = [];
  let dbFooterNav: { label: string; href: string; icon?: string }[] = [];
  if (!shouldSkipDbCall()) {
    try {
      const dbSite = await resolveDbSiteBySlug(site.id);
      if (dbSite) {
        const t = dbSite.theme as Record<string, string> | null;
        dbTheme = {
          primaryColor: t?.primary_color || site.theme.primaryColor,
          secondaryColor: t?.secondary_color || site.theme.accentColor,
          accentColor: t?.accent_color || site.theme.accentColor,
          accentTextColor: t?.accent_text_color || site.theme.accentTextColor,
          fontHeading: t?.font_heading || site.theme.fontHeading,
          fontBody: t?.font_body || t?.font || site.theme.fontBody,
          layoutVariant: (t?.layout_variant as LayoutVariant) || "standard",
          customCss: dbSite.custom_css,
        };
        // Dynamic navigation from DB
        if (Array.isArray(dbSite.nav_items) && dbSite.nav_items.length > 0) {
          dbNavItems = dbSite.nav_items;
        }
        if (Array.isArray(dbSite.footer_nav) && dbSite.footer_nav.length > 0) {
          dbFooterNav = dbSite.footer_nav;
        }
      }
    } catch (err) {
      logger.warn("Failed to load DB theme/nav for public layout, falling back to config", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Merge: DB theme overrides config theme
  const themeConfig: Partial<SiteThemeConfig> = {
    primaryColor: site.theme.primaryColor,
    secondaryColor: site.theme.accentColor,
    accentColor: site.theme.accentColor,
    accentTextColor: site.theme.accentTextColor,
    fontHeading: site.theme.fontHeading,
    fontBody: site.theme.fontBody,
    layoutVariant: "standard",
    ...dbTheme,
  };

  return (
    <ThemeProvider theme={themeConfig}>
      <div lang={site.language} dir={site.direction} className="flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
        >
          {site.language === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
        </a>
        <SiteHeader site={site} dbNavItems={dbNavItems} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <SiteFooter site={site} dbFooterNav={dbFooterNav} />
        {site.features.cookieConsent && <CookieConsentCmp language={site.language} />}
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </ThemeProvider>
  );
}

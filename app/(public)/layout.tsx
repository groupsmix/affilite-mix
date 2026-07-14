import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { shouldSkipDbCall } from "@/lib/db-available";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";
import { ThemeProvider } from "./components/theme-provider";
import type { SiteThemeConfig } from "./components/theme-provider";
import type { LayoutVariant } from "@/config/site-definition";
import { resolveLayoutVariant } from "@/lib/layout-variant";
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
    // Use an absolute title so the root layout's `%s | ${site.name}`
    // template does not double the brand into "WristNerd | WristNerd".
    // The niche gives the homepage a descriptive, keyword-bearing title.
    title: { absolute: metaTitle || `${site.name} — ${site.brand.niche}` },
    description: metaDescription || `${site.name} — curated content and product recommendations`,
    icons: { icon: finalFavicon },
    ...(ogImageUrl && {
      openGraph: { images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    }),
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const site = await getCurrentSite();
  // ACCEPTED-RISK (A68/A106): style-src 'unsafe-inline' is kept because CSP
  // nonces only protect <style> elements, not style *attributes* used by
  // ThemeProvider CSS-var injection, cookie consent, and React hydration.
  // Script injection IS nonce-locked via script-src. See lib/csp.ts:109-117.

  // Read DB row for dynamic theme overrides, nav items, and footer nav
  let dbTheme: Partial<SiteThemeConfig> = {};
  let dbLayoutVariant: string | null = null;
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
        };
        dbLayoutVariant = t?.layout_variant ?? null;
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

  // Merge: DB theme overrides config theme.
  // layoutVariant priority: a valid DB value → site config → "standard".
  // resolveLayoutVariant() guards against a missing/invalid DB value being
  // coerced to "standard" and shadowing the site's configured layout.
  const resolvedLayoutVariant: LayoutVariant = resolveLayoutVariant(
    dbLayoutVariant,
    site.layoutVariant,
  );

  const themeConfig: Partial<SiteThemeConfig> = {
    primaryColor: site.theme.primaryColor,
    secondaryColor: site.theme.accentColor,
    accentColor: site.theme.accentColor,
    accentTextColor: site.theme.accentTextColor,
    accentLightColor: site.theme.accentLightColor,
    fontHeading: site.theme.fontHeading,
    fontBody: site.theme.fontBody,
    ...dbTheme,
    // Authoritative: set after the DB spread so the resolved variant (which
    // already accounts for any DB value) is what ThemeProvider renders as
    // data-layout, matching what SiteHeader/SiteFooter receive below.
    layoutVariant: resolvedLayoutVariant,
  };

  return (
    <ThemeProvider theme={themeConfig}>
      <div className="flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
        >
          {site.language === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
        </a>
        <SiteHeader site={site} dbNavItems={dbNavItems} layoutVariant={resolvedLayoutVariant} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <SiteFooter site={site} dbFooterNav={dbFooterNav} layoutVariant={resolvedLayoutVariant} />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          containerAriaLabel="Notifications"
        />
      </div>
    </ThemeProvider>
  );
}

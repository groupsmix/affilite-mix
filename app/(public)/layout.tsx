import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCurrentSite } from "@/lib/site-context";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { shouldSkipDbCall } from "@/lib/db-available";
import { isStaticConfigSite } from "@/lib/site-config-authority";
import { PATHNAME_HEADER } from "@/lib/request-path";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";
import { JsonLd, organizationJsonLd } from "./components/json-ld";
import { AdSlot } from "./components/ads/ad-slot";
import { ThemeProvider } from "./components/theme-provider";
import type { SiteThemeConfig } from "./components/theme-provider";
import { resolvePresentation, type PresentationSource } from "@/lib/presentation/resolve";
import { getPublishedPresentationSource } from "@/lib/dal/site-presentations";
import { Toaster } from "sonner";
import { logger } from "@/lib/logger";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();

  // Pull per-niche SEO metadata + favicon from the DB site record
  let metaTitle: string | undefined;
  let metaDescription: string | undefined;
  let ogImageUrl: string | undefined;
  let dbFaviconUrl: string | undefined;
  if (!shouldSkipDbCall() && !isStaticConfigSite(site)) {
    try {
      const dbSite = await getSiteRowByDomain(site.domain);
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

  const headerList = await headers();
  const pathname = headerList.get(PATHNAME_HEADER) ?? "/";

  return {
    // Use an absolute title so the root layout's `%s | ${site.name}`
    // template does not double the brand into "WristNerd | WristNerd".
    // The niche gives the homepage a descriptive, keyword-bearing title.
    title: { absolute: metaTitle || `${site.name} — ${site.brand.niche}` },
    description: metaDescription || `${site.name} — curated content and product recommendations`,
    icons: { icon: finalFavicon },
    alternates: {
      canonical: pathname,
      types: {
        "application/rss+xml": `https://${site.domain}/feed.xml`,
      },
      languages: {
        [site.language ?? "en"]: pathname,
        "x-default": pathname,
      },
    },
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

  // Database-managed tenants read runtime theme/navigation from their row.
  // Sites registered in config/sites remain code-authoritative.
  let dbTheme: Partial<SiteThemeConfig> = {};
  let dbPresentation: PresentationSource | null = null;
  let dbNavItems: { label: string; href: string; icon?: string }[] = [];
  let dbFooterNav: { label: string; href: string; icon?: string }[] = [];
  if (!shouldSkipDbCall() && !isStaticConfigSite(site)) {
    try {
      const dbSite = await getSiteRowByDomain(site.domain);
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
        // Presentation authority (Phase 2): the DB-authoritative source is the
        // published `site_presentations` row, resolved + cached by site. Every
        // field is validated by resolvePresentation before it reaches a
        // component. When no published presentation exists we fall back to the
        // legacy `sites.theme` blob so pre-migration tenants keep their design.
        const publishedPresentation = await getPublishedPresentationSource(dbSite.id);
        if (publishedPresentation) {
          dbPresentation = publishedPresentation;
        } else {
          const blob = dbSite.theme as Record<string, unknown> | null;
          dbPresentation = {
            layoutVariant: t?.layout_variant ?? null,
            headerVariant: (blob?.header_variant as string | undefined) ?? null,
            footerVariant: (blob?.footer_variant as string | undefined) ?? null,
            headerConfig: blob?.header_config,
            footerConfig: blob?.footer_config,
            headerTokens: blob?.header_tokens,
          };
        }
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

  // Database values apply only to database-managed tenants. Presentation is
  // resolved by layering: defaults -> variant defaults -> config -> DB. Site
  // identity/domain stays code-authoritative; only visual presentation is
  // DB-authoritative. A missing/malformed record falls back to safe defaults.
  const presentation = resolvePresentation(site, dbPresentation);

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
    layoutVariant: presentation.headerVariant,
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
        <SiteHeader site={site} dbNavItems={dbNavItems} presentation={presentation} />
        <AdSlot placementType="header" className="pt-4" />
        <JsonLd data={organizationJsonLd(site)} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <AdSlot placementType="footer" className="pb-4" />
        <SiteFooter
          site={site}
          dbFooterNav={dbFooterNav}
          footerVariant={presentation.footerVariant}
          config={presentation.footer}
        />
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

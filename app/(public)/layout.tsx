import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";
import CookieConsent from "./components/cookie-consent";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    icons: { icon: site.brand.faviconUrl || "/favicon.svg" },
  };
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await getCurrentSite();

  const fontMap: Record<string, string> = {
    "Inter": "var(--font-inter), sans-serif",
    "IBM Plex Sans Arabic": "var(--font-ibm-plex-arabic), sans-serif",
    "Playfair Display": "var(--font-playfair), serif",
  };

  const cssVars = {
    "--color-primary": site.theme.primaryColor,
    "--color-accent": site.theme.accentColor,
    "--font-heading": fontMap[site.theme.fontHeading] ?? "var(--font-inter), sans-serif",
    "--font-body": fontMap[site.theme.fontBody] ?? "var(--font-inter), sans-serif",
    // Namespaced aliases to avoid third-party conflicts (#16)
    "--nh-color-primary": site.theme.primaryColor,
    "--nh-color-accent": site.theme.accentColor,
    "--nh-font-heading": fontMap[site.theme.fontHeading] ?? "var(--font-inter), sans-serif",
    "--nh-font-body": fontMap[site.theme.fontBody] ?? "var(--font-inter), sans-serif",
  } as React.CSSProperties;

  return (
    <div
      lang={site.language}
      dir={site.direction}
      style={cssVars}
      className="flex min-h-screen flex-col"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-gray-900 focus:shadow-md"
      >
        {site.language === "ar" ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
      </a>
      <SiteHeader site={site} />
      <main id="main-content" className="flex-1">{children}</main>
      <SiteFooter site={site} />
      {site.features.cookieConsent && <CookieConsent language={site.language} />}
    </div>
  );
}

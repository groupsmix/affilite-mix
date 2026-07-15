import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import { getCurrentSite } from "@/lib/site-context";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { shouldSkipDbCall } from "@/lib/db-available";
import { isStaticConfigSite } from "@/lib/site-config-authority";
import { PATHNAME_HEADER } from "@/lib/request-path";
import { WebVitals } from "./web-vitals";
import { logger } from "@/lib/logger";
import CookieConsentCmp from "./(public)/components/cookie-consent-cmp";
import "./globals.css";

/*
 * Font families are declared at module scope (required by next/font) but
 * only the CSS variables actually used by the current site are applied to
 * the <html> element. This keeps the font CSS payload minimal — the browser
 * only downloads fonts whose CSS variables are referenced in computed styles.
 */

export async function generateViewport(): Promise<Viewport> {
  try {
    const site = await getCurrentSite();
    const themeColor = site.theme?.primaryColor || "#1e293b";
    return { themeColor };
  } catch {
    // fail-open: best-effort
    return { themeColor: "#1e293b" };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const site = await getCurrentSite();

    // Skip the DB round-trip entirely when Supabase is not configured
    // (e.g. during `next build` without env vars set). This prevents the
    // noisy "Failed to generate metadata from DB" warn that floods local build
    // output even though the fallback is completely correct.
    const dbSite =
      shouldSkipDbCall() || isStaticConfigSite(site) ? null : await getSiteRowByDomain(site.domain);

    const title = dbSite?.meta_title || site.name;
    const description =
      dbSite?.meta_description || site.brand.description || "Multi-site affiliate platform";
    const ogImage = dbSite?.og_image_url || undefined;

    return {
      metadataBase: new URL(`https://${site.domain}`),
      title: {
        default: title,
        template: `%s | ${title}`,
      },
      description,
      openGraph: {
        title,
        description,
        siteName: site.name,
        type: "website",
        locale: site.locale,
        ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
      manifest: "/manifest.webmanifest",
    };
  } catch (err) {
    logger.warn("Failed to generate metadata from DB, falling back to defaults", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      title: "Admin",
      description: "Multi-site affiliate platform",
    };
  }
}

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-arabic",
  // preload: false — this font is only used by sites with Arabic content.
  // next/font preloads ALL declared fonts on every page (including the admin
  // dashboard), causing "preloaded but not used" console warnings for 8+ woff2
  // files. The font is still available via its CSS variable; the browser
  // fetches it lazily when a computed style references it.
  preload: false,
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-playfair",
  // preload: false — only used by sites that select Playfair as their heading
  // or body font. Same rationale as ibmPlexArabic above.
  preload: false,
});

const fontVarMap: Record<string, string> = {
  Inter: inter.variable,
  "IBM Plex Sans Arabic": ibmPlexArabic.variable,
  "Playfair Display": playfairDisplay.variable,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getCurrentSite();
  const headerList = await headers();

  // The admin panel shares this root layout, but the public GDPR cookie-consent
  // banner must never render on admin routes. Detect the admin path prefix via
  // the request pathname header propagated by middleware and suppress the banner
  // for `/q7m-k4j9` and its sub-paths (the public render is left unchanged).
  const pathname = headerList.get(PATHNAME_HEADER) ?? "";
  const isAdminRoute = pathname === "/q7m-k4j9" || pathname.startsWith("/q7m-k4j9/");

  // Collect only the font CSS variables that this site actually uses
  const needed = new Set<string>();
  // Inter is always included as the default / fallback
  needed.add(inter.variable);
  if (site.theme?.fontHeading && fontVarMap[site.theme.fontHeading]) {
    needed.add(fontVarMap[site.theme.fontHeading]!);
  }
  if (site.theme?.fontBody && fontVarMap[site.theme.fontBody]) {
    needed.add(fontVarMap[site.theme.fontBody]!);
  }

  return (
    <html
      lang={site.language ?? "en"}
      dir={site.direction ?? "ltr"}
      className={Array.from(needed).join(" ")}
      suppressHydrationWarning
    >
      <body>
        <WebVitals />
        {site.features.cookieConsent && !isAdminRoute && (
          <CookieConsentCmp language={site.language} siteId={site.id} />
        )}
        {children}
      </body>
    </html>
  );
}

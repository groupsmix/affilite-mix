import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Playfair_Display } from "next/font/google";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { WebVitals } from "./web-vitals";
import "./globals.css";

/*
 * Font families are declared at module scope (required by next/font) but
 * only the CSS variables actually used by the current site are applied to
 * the <html> element. This keeps the font CSS payload minimal — the browser
 * only downloads fonts whose CSS variables are referenced in computed styles.
 */

export async function generateMetadata(): Promise<Metadata> {
  try {
    const site = await getCurrentSite();
    const dbSite = await resolveDbSiteBySlug(site.id);

    const title = dbSite?.meta_title || site.name;
    const description =
      dbSite?.meta_description || site.brand.description || "Multi-site affiliate platform";
    const ogImage = dbSite?.og_image_url || undefined;

    const themeColor = site.theme?.primaryColor || "#1e293b";

    return {
      title: {
        default: title,
        template: `%s | ${title}`,
      },
      description,
      themeColor,
      openGraph: {
        title,
        description,
        siteName: site.name,
        type: "website",
        ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
    };
  } catch {
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
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-playfair",
});

const fontVarMap: Record<string, string> = {
  Inter: inter.variable,
  "IBM Plex Sans Arabic": ibmPlexArabic.variable,
  "Playfair Display": playfairDisplay.variable,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getCurrentSite();

  // Collect only the font CSS variables that this site actually uses
  const needed = new Set<string>();
  // Inter is always included as the default / fallback
  needed.add(inter.variable);
  if (site.theme?.fontHeading && fontVarMap[site.theme.fontHeading]) {
    needed.add(fontVarMap[site.theme.fontHeading]);
  }
  if (site.theme?.fontBody && fontVarMap[site.theme.fontBody]) {
    needed.add(fontVarMap[site.theme.fontBody]);
  }

  return (
    <html lang={site.language} dir={site.direction} className={Array.from(needed).join(" ")}>
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  );
}

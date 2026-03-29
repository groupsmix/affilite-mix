import { getCurrentSite } from "@/lib/site-context";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";

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
  } as React.CSSProperties;

  return (
    <div
      lang={site.language}
      dir={site.direction}
      style={cssVars}
      className="flex min-h-screen flex-col"
    >
      <SiteHeader site={site} />
      <main className="flex-1">{children}</main>
      <SiteFooter site={site} />
    </div>
  );
}

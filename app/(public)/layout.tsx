import { getCurrentSite } from "@/lib/site-context";
import { SiteHeader } from "./components/site-header";
import { SiteFooter } from "./components/site-footer";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await getCurrentSite();

  const cssVars = {
    "--color-primary": site.theme.primaryColor,
    "--color-accent": site.theme.accentColor,
    "--font-heading": `"${site.theme.fontHeading}", sans-serif`,
    "--font-body": `"${site.theme.fontBody}", sans-serif`,
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

import { getCurrentSite } from "@/lib/site-context";

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
      className="min-h-screen"
    >
      {/* Header placeholder — Phase B/C */}
      <main>{children}</main>
      {/* Footer placeholder — Phase B/C */}
    </div>
  );
}

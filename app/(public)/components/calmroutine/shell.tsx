import type { SiteDefinition } from "@/config/site-definition";
import { CalmHeader } from "./header";
import { CalmFooter } from "./footer";

export function CalmShell({ site, children }: { site: SiteDefinition; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <CalmHeader />
      <main className="flex-1">{children}</main>
      <CalmFooter siteName={site.name} description={site.brand.description} />
    </div>
  );
}

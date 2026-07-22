import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";

interface SiteFooterProps {
  site: SiteDefinition;
}

export function SiteFooter({ site }: SiteFooterProps) {
  const year = new Date().getFullYear();

  const footerNav = site.footerNav as Record<string, { title: string; href: string }[]> | undefined;

  return (
    <footer className="border-t border-border bg-secondary/20 pt-12 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-lg font-semibold tracking-tight font-playfair">
                {site.name}
              </span>
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {site.brand.description}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">{site.brand.tagline}</p>
          </div>

          {footerNav &&
            Object.entries(footerNav).map(([section, items]) => (
              <div key={section}>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  {section.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase())}
                </h4>
                <ul className="mt-4 space-y-2">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>{site.affiliateDisclosure}</p>
          <p className="mt-2">{site.contentDisclosure}</p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <span className="text-sm text-muted-foreground">
            &copy; {year} {site.name}. All rights reserved.
          </span>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/affiliate-disclosure" className="hover:text-foreground">
              Affiliate Disclosure
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

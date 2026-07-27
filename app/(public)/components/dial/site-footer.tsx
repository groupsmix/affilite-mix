import Image from "next/image";
import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";

interface SiteFooterProps {
  site: SiteDefinition;
}

export function SiteFooter({ site }: SiteFooterProps) {
  const year = new Date().getFullYear();

  const footerNav = site.footerNav as Record<string, { title: string; href: string }[]> | undefined;

  return (
    <footer className="border-t border-border bg-secondary/20">
      {/* Affiliate disclosure — an essential trust signal for affiliate sites */}
      <div id="disclosure" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Affiliate disclosure:</span>{" "}
            {site.affiliateDisclosure}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              {site.brand.logo ? (
                <span className="relative block h-7 w-[42px] shrink-0">
                  <Image
                    src={site.brand.logo}
                    alt={site.name}
                    fill
                    sizes="60px"
                    className="object-contain"
                  />
                </span>
              ) : (
                <>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/60">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>
                  <span className="font-serif text-lg font-semibold tracking-tight">
                    {site.name}
                  </span>
                </>
              )}
              {site.brand.logo && <span className="sr-only">{site.name}</span>}
            </Link>
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              {site.brand.description}
            </p>
          </div>

          {footerNav &&
            Object.entries(footerNav).map(([section, items]) => (
              <div key={section}>
                <h3 className="text-sm font-semibold">
                  {section.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase())}
                </h3>
                <ul className="mt-4 space-y-3">
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

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            &copy; {year} {site.name}. All rights reserved.
          </p>
          <p>Prices and availability are accurate as of publication.</p>
        </div>
      </div>
    </footer>
  );
}

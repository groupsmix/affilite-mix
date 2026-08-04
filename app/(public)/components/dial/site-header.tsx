"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { DialHomepageConfig, DialPriceTier } from "@/lib/dial-config";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  site: SiteDefinition;
  config: DialHomepageConfig;
}

function tierGuideSlug(tier: DialPriceTier | undefined, fallbackId: string): string {
  return tier?.guideSlug ?? `best-watches-${fallbackId}`;
}

export function resolveDialHeaderHref(
  href: string,
  pathname: string,
  _tiers: DialPriceTier[],
): string {
  const isHome = pathname === "/";

  const tierAnchor = /^#tier-(.+)$/.exec(href);
  if (tierAnchor) {
    const id = tierAnchor[1] ?? "";
    if (!id) return href;
    const tier = _tiers.find((t) => t.id === id);
    return isHome ? href : `/guide/${tierGuideSlug(tier, id)}`;
  }

  if (href === "#top-picks" || href === "#top") {
    return isHome ? href : "/#top-picks";
  }

  if (href === "#how-we-test") {
    return isHome ? href : "/how-we-rank";
  }

  return href;
}

export function SiteHeader({ site, config }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = config.navLinks;
  const tiers = config.priceTiers;

  const effectiveNavLinks = navLinks;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
            {site.name}
          </span>
          {config.headerTagline && (
            <>
              <span aria-hidden className="hidden h-4 w-px self-center bg-border sm:block" />
              <span className="hidden text-xs text-muted-foreground sm:block">
                {config.headerTagline}
              </span>
            </>
          )}
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {effectiveNavLinks.map((link) => {
            const resolved = resolveDialHeaderHref(link.href, pathname, tiers);
            const routePath = resolved.split("#")[0] ?? "";
            const isActive = routePath.length > 1 && pathname.startsWith(routePath);
            return (
              <li key={link.href}>
                <Link
                  href={resolved}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-foreground",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center md:hidden">
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Search className="h-5 w-5" />
          </Link>
          <button
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-b border-border/60 bg-background/95 px-4 pb-4 backdrop-blur-md md:hidden">
          <ul className="flex flex-col gap-3 pt-2">
            {effectiveNavLinks.map((link) => {
              const resolved = resolveDialHeaderHref(link.href, pathname, tiers);
              return (
                <li key={link.href}>
                  <Link
                    href={resolved}
                    className="block text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}

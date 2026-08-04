"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { DialHomepageConfig, DialPriceTier } from "@/lib/dial-config";
import { Button } from "@/components/ui/button";
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

function deriveCta(
  navLinks: DialHomepageConfig["navLinks"],
  pathname: string,
  tiers: DialPriceTier[],
): { label: string; href: string } {
  const link = navLinks.find(
    (l) =>
      l.href.includes("best-watches-under-500") ||
      l.label.toLowerCase().includes("best under $500") ||
      l.label.toLowerCase().includes("under $500"),
  ) ??
    navLinks.find(
      (l) =>
        l.href.includes("top-picks") ||
        l.label.toLowerCase().includes("top pick") ||
        l.label.toLowerCase().includes("see top"),
    ) ??
    navLinks.find((l) => l.href.startsWith("/") || l.href.startsWith("#")) ?? {
      label: "See top picks",
      href: "#top-picks",
    };
  const isUnder500 =
    link.href.includes("best-watches-under-500") || link.label.toLowerCase().includes("under $500");
  const label = isUnder500 ? "Best Under $500" : link.label;
  return { label, href: resolveDialHeaderHref(link.href, pathname, tiers) };
}

export function SiteHeader({ site, config }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = config.navLinks;
  const tiers = config.priceTiers;
  const cta = useMemo(() => deriveCta(navLinks, pathname, tiers), [navLinks, pathname, tiers]);

  // Automatically add a Blog link when the site supports blog content, without
  // overriding the dashboard-driven navLinks order.
  const hasBlog = site.contentTypes.some((ct) => ct.value === "blog");
  const hasBlogLink = navLinks.some((l) => l.href === "/blog" || l.label.toLowerCase() === "blog");
  const effectiveNavLinks =
    hasBlog && !hasBlogLink ? [...navLinks, { label: "Blog", href: "/blog" }] : navLinks;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          {site.brand.mark ? (
            <>
              <Image
                src={site.brand.mark}
                alt=""
                width={36}
                height={36}
                sizes="36px"
                priority
                className="h-9 w-9 object-contain"
              />
              <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
                {site.name}
              </span>
            </>
          ) : site.brand.logo ? (
            <span className="inline-flex rounded-md bg-black px-2 py-1.5">
              <Image
                src={site.brand.logo}
                alt={site.name}
                width={96}
                height={64}
                sizes="96px"
                priority
                className="h-16 w-auto object-contain"
              />
            </span>
          ) : (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="font-serif text-lg font-semibold tracking-tight">{site.name}</span>
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

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Button size="sm" asChild>
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>

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
          <div className="mt-4">
            <Button className="w-full" size="sm" asChild>
              <Link href={cta.href} onClick={() => setMobileOpen(false)}>
                {cta.label}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

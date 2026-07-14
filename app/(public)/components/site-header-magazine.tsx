"use client";

import type { SiteDefinition, NavItem } from "@/config/site-definition";
import Link from "next/link";
import { Search } from "lucide-react";
import { MobileMenu } from "./mobile-menu";
import { ActiveNavLinks } from "./active-nav-links";
import { DarkModeToggle } from "./dark-mode-toggle";
import { usePathname } from "next/navigation";
import { useScrolled } from "./use-scrolled";

interface SiteHeaderMagazineProps {
  site: SiteDefinition;
  dbNavItems?: { label: string; href: string; icon?: string }[];
}

export function SiteHeaderMagazine({ site, dbNavItems }: SiteHeaderMagazineProps) {
  const scrolled = useScrolled(20);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const nav: NavItem[] =
    dbNavItems && dbNavItems.length > 0
      ? dbNavItems.map((item) => ({ title: item.label, href: item.href }))
      : site.nav;

  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  return (
    <header
      className="fixed top-0 z-50 h-20 w-full transition-all duration-300"
      style={{
        backgroundColor:
          isHome && !scrolled
            ? "transparent"
            : "color-mix(in srgb, var(--color-primary) 95%, transparent)",
        backdropFilter: isHome && !scrolled ? "none" : "blur(12px)",
        borderBottom:
          isHome && !scrolled
            ? "1px solid transparent"
            : "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)",
      }}
      aria-label={site.language === "ar" ? "التنقل" : "Main navigation"}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-0.5 select-none font-heading"
          aria-label={site.name}
        >
          <span className="text-xl font-extrabold tracking-tight text-white">{part1}</span>
          {part2 && (
            <span
              className="text-xl font-extrabold tracking-tight"
              style={{ color: "var(--color-accent-light, var(--color-accent))" }}
            >
              &nbsp;{part2}
            </span>
          )}
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label={site.language === "ar" ? "التنقل" : "Main navigation"}
        >
          <ActiveNavLinks
            nav={nav}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            activeClassName="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            activeStyle={{ color: "var(--color-accent, var(--color-accent-light))" }}
          />
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="rounded-md p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={site.language === "ar" ? "بحث" : "Search"}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="text-white/70 [&_button]:hover:bg-white/10 [&_button]:hover:text-white">
            <DarkModeToggle />
          </div>

          <div className="md:hidden">
            <MobileMenu
              nav={nav}
              searchLabel={site.language === "ar" ? "بحث" : "Search"}
              direction={site.direction}
              dark
            />
          </div>
        </div>
      </div>
    </header>
  );
}

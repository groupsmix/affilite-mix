import type { SiteDefinition, NavItem, LayoutVariant } from "@/config/site-definition";
import Link from "next/link";
import { MobileMenu } from "./mobile-menu";
import { ActiveNavLinks } from "./active-nav-links";
import { DarkModeToggle } from "./dark-mode-toggle";
import { SiteHeaderCompare } from "./site-header-compare";
import { SiteHeaderMagazine } from "./site-header-magazine";

interface SiteHeaderProps {
  site: SiteDefinition;
  /** Optional dynamic nav items from DB (overrides site.nav if provided) */
  dbNavItems?: { label: string; href: string; icon?: string }[];
  /**
   * Resolved layout variant — DB value takes precedence over site config.
   * Passed from the public layout so headers don't need to re-read the DB.
   */
  layoutVariant?: LayoutVariant;
}

export function SiteHeader({ site, dbNavItems, layoutVariant = "standard" }: SiteHeaderProps) {
  // Dispatch to per-variant header implementations.
  // Each variant is a self-contained component with its own design system.
  if (layoutVariant === "compare") {
    return <SiteHeaderCompare site={site} dbNavItems={dbNavItems} />;
  }
  if (layoutVariant === "magazine") {
    return <SiteHeaderMagazine site={site} dbNavItems={dbNavItems} />;
  }
  // "minimal", "directory" — stubs that fall through to standard
  // until their designs are implemented. Add their imports + conditions here.

  // --- "standard" (default) ---
  // Theme-aware dark header. Uses the site's primary color as the background
  // and accent for active states, so each site gets a distinct header from
  // its own palette without a per-variant component.
  const nav: NavItem[] =
    dbNavItems && dbNavItems.length > 0
      ? dbNavItems.map((item) => ({ title: item.label, href: item.href }))
      : site.nav;

  // Split brand name: first word in white, rest in accent-light.
  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  return (
    <header
      className="sticky top-0 z-40 shadow-sm"
      style={{ backgroundColor: "var(--color-primary, #1e293b)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Two-tone wordmark */}
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

        {/* Desktop nav */}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label={site.language === "ar" ? "التنقل" : "Main navigation"}
        >
          <ActiveNavLinks
            nav={nav}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            activeClassName="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--color-accent-foreground)]"
            activeStyle={{ backgroundColor: "var(--color-accent, #3b82f6)" }}
          />
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={site.language === "ar" ? "بحث" : "Search"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
          </Link>

          {/* Dark mode toggle — muted tint on dark bg */}
          <div className="text-gray-400 [&_button]:hover:bg-white/10 [&_button]:hover:text-white">
            <DarkModeToggle />
          </div>

          {/* Mobile nav */}
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

      {/* Bottom border — accent-tinted separator for sticky clarity */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #3b82f6), transparent 80%), transparent)",
        }}
        aria-hidden="true"
      />
    </header>
  );
}

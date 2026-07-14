/**
 * "compare" layout variant header — used by compareai.site / AI Compared.
 *
 * Design language:
 *   - Dark navy (#0B1120) background with a cobalt bottom accent stripe
 *   - Two-tone wordmark: "AI" in white, "Compared" in cobalt
 *   - Pill-style nav links with hover highlight
 *   - "Compare AI" CTA button (cobalt fill, white text)
 *   - Search icon + dark-mode toggle on the right
 *
 * All colours reference CSS vars injected by ThemeProvider so the DB
 * can override them at runtime without a code deploy.
 */

import type { SiteDefinition, NavItem } from "@/config/site-definition";
import Link from "next/link";
import { ActiveNavLinks } from "./active-nav-links";
import { DarkModeToggle } from "./dark-mode-toggle";
import { MobileMenu } from "./mobile-menu";

interface SiteHeaderCompareProps {
  site: SiteDefinition;
  dbNavItems?: { label: string; href: string; icon?: string }[];
}

export function SiteHeaderCompare({ site, dbNavItems }: SiteHeaderCompareProps) {
  const nav: NavItem[] =
    dbNavItems && dbNavItems.length > 0
      ? dbNavItems.map((item) => ({ title: item.label, href: item.href }))
      : site.nav;

  // Split brand name into two parts for the two-tone wordmark.
  // "AI Compared" → ["AI", "Compared"]. Falls back gracefully for other names.
  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  // Find the "Comparisons" nav item to use as the CTA target.
  const ctaHref =
    nav.find((n) => n.href.includes("comparison"))?.href ??
    nav.find((n) => n.href.includes("review"))?.href ??
    "/";

  return (
    <header
      className="sticky top-0 z-40 shadow-sm"
      style={{ backgroundColor: "var(--color-primary, #0B1120)" }}
    >
      {/* Cobalt accent stripe at the top */}
      <div
        className="h-0.5 w-full"
        style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
        aria-hidden="true"
      />

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
              style={{ color: "var(--color-accent-light, #3B82F6)" }}
            >
              &nbsp;{part2}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <ActiveNavLinks
            nav={nav}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            activeClassName="rounded-md px-3 py-1.5 text-sm font-medium text-white bg-white/10"
          />
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <Link
            href="/search"
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Search"
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

          {/* CTA — hidden on very small screens, visible md+ */}
          <Link
            href={ctaHref}
            className="hidden rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-accent-foreground)] opacity-100 transition-opacity hover:opacity-85 md:block"
            style={{
              backgroundColor: "var(--color-accent, #2D6BF0)",
            }}
          >
            Compare AI
          </Link>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <MobileMenu nav={nav} searchLabel="Search" direction={site.direction} dark />
          </div>
        </div>
      </div>

      {/* Bottom border — subtle glow instead of a hard line */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #2D6BF0), transparent 80%), transparent)",
        }}
        aria-hidden="true"
      />
    </header>
  );
}

/**
 * Shared, accessible header building blocks used by every header variant.
 * Centralising these keeps landmarks, ARIA labelling, RTL behaviour, and
 * token-driven colours consistent no matter which design a site selects — so
 * a new variant is a layout composition, not a fresh a11y implementation.
 *
 * Colours reference the header-scoped CSS custom properties emitted by
 * `headerCssVars` (see lib/presentation/header-style.ts), so runtime design
 * tokens flow through without per-variant code.
 */
import Link from "next/link";
import type { SiteDefinition, NavItem } from "@/config/site-definition";
import type { HeaderConfig } from "@/config/presentation";
import { CONTAINER_WIDTH_CLASS, NAV_ALIGNMENT_CLASS } from "@/config/presentation";
import { cn } from "@/lib/utils";
import { ActiveNavLinks } from "../active-nav-links";
import { MobileMenu } from "../mobile-menu";

const NAV_LINK_CLASS =
  "rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--header-fg-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[color:var(--header-fg)]";
const NAV_LINK_ACTIVE_CLASS =
  "rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--header-fg)] bg-[var(--header-hover)]";

function SearchIcon() {
  return (
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
  );
}

/** Resolve the effective nav items — DB overrides win, else site config. */
export function resolveNav(
  site: SiteDefinition,
  dbNavItems?: { label: string; href: string; icon?: string; children?: NavItem[] }[],
): NavItem[] {
  return dbNavItems && dbNavItems.length > 0
    ? dbNavItems.map((item) => ({
        title: item.label,
        href: item.href,
        children: item.children,
      }))
    : site.nav;
}

/** Optional announcement bar rendered above the header bar. */
export function AnnouncementBar({ config }: { config: HeaderConfig["announcement"] }) {
  if (!config.enabled || !config.text) return null;
  const inner = (
    <div className="mx-auto max-w-6xl px-4 py-1.5 text-center text-xs font-medium">
      {config.text}
    </div>
  );
  return (
    <div
      className="w-full text-white"
      style={{ backgroundColor: "var(--header-accent, #3b82f6)" }}
      role="region"
      aria-label="Announcement"
    >
      {config.href ? (
        <Link href={config.href} className="block hover:opacity-90">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}

/** Two-tone brand wordmark / logo, honouring the configured logo mode. */
export function HeaderWordmark({
  site,
  logoMode,
}: {
  site: SiteDefinition;
  logoMode: HeaderConfig["logoMode"];
}) {
  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  const showImage = (logoMode === "image" || logoMode === "image-and-text") && !!site.brand.logo;
  const showText = logoMode !== "image" || !site.brand.logo;

  return (
    <Link
      href="/"
      className="flex items-center gap-2 select-none"
      aria-label={site.name}
      style={{ fontFamily: "var(--header-font)" }}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- logo is a small, already-optimised site asset; next/image adds no value in the header and complicates token-based sizing.
        <img
          src={site.brand.logo}
          alt=""
          className={`w-auto ${logoMode === "image" ? "h-10 rounded bg-white p-1 shadow-sm" : "h-8"}`}
          aria-hidden="true"
        />
      )}
      {showText && (
        <span className="flex items-center gap-0.5">
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: "var(--header-fg)" }}
          >
            {part1}
          </span>
          {part2 && (
            <span
              className="text-xl font-extrabold tracking-tight"
              style={{ color: "var(--header-accent)" }}
            >
              &nbsp;{part2}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

/** Desktop primary navigation. */
export function HeaderNav({
  nav,
  alignment,
  ariaLabel,
  className,
}: {
  nav: NavItem[];
  alignment: HeaderConfig["navAlignment"];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "hidden flex-1 items-center gap-1 md:flex",
        NAV_ALIGNMENT_CLASS[alignment],
        className,
      )}
      aria-label={ariaLabel}
    >
      <ActiveNavLinks
        nav={nav}
        className={NAV_LINK_CLASS}
        activeClassName={NAV_LINK_ACTIVE_CLASS}
      />
    </nav>
  );
}

/** Search affordance linking to the search page. */
export function HeaderSearch({ label }: { label: string }) {
  return (
    <Link
      href="/search"
      role="button"
      className="rounded-md p-2 text-[color:var(--header-fg-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[color:var(--header-fg)]"
      aria-label={label}
    >
      <SearchIcon />
    </Link>
  );
}

/** Accent call-to-action button. */
export function HeaderCta({ href, label }: { href: string; label: string }) {
  if (!label) return null;
  return (
    <Link
      href={href}
      className="hidden rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 md:block"
      style={{ backgroundColor: "var(--header-accent)" }}
    >
      {label}
    </Link>
  );
}

/** Secondary strip of category chips beneath the header bar. */
export function CategoryStrip({
  items,
  widthClass,
}: {
  items: HeaderConfig["categoryStrip"]["items"];
  widthClass: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      className="w-full border-t"
      style={{ borderColor: "var(--header-border)" }}
      aria-label="Categories"
    >
      <div className={cn("mx-auto flex gap-2 overflow-x-auto px-4 py-2", widthClass)}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium text-[color:var(--header-fg-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[color:var(--header-fg)]"
            style={{ borderColor: "var(--header-border)" }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Mobile hamburger + drawer. */
export function HeaderMobile({
  nav,
  appearance,
  searchLabel,
  direction,
}: {
  nav: NavItem[];
  appearance: "light" | "dark";
  searchLabel: string;
  direction: "ltr" | "rtl";
}) {
  return (
    <div className="md:hidden">
      <MobileMenu
        nav={nav}
        searchLabel={searchLabel}
        direction={direction}
        appearance={appearance}
      />
    </div>
  );
}

/** Container width helper shared by variants. */
export function containerWidthClass(width: HeaderConfig["containerWidth"]): string {
  return CONTAINER_WIDTH_CLASS[width];
}

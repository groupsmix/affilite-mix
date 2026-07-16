/**
 * Presentation configuration — the typed, DB-safe description of a site's
 * header/footer chrome. These types are shared by:
 *   - static config sites (config/site-definition.ts)
 *   - the DB-authoritative `site_presentations` record (Phase 2)
 *   - the public header/footer variant components
 *
 * Design rules:
 *   - Only enumerated, bounded, safe options are stored here. NEVER raw CSS
 *     class strings or JSX — those would let a dashboard/AI edit inject
 *     arbitrary styles or markup that bypass the CSP and design system.
 *   - Every field has a safe default so a partial/invalid record still renders.
 *   - Variant selection (which component) is separate from HeaderConfig (how
 *     that component behaves), so header and footer designs vary independently.
 */
import type { LayoutVariant } from "./site-definition";

export type { LayoutVariant };

/** How the brand is presented in the header. */
export type LogoMode = "wordmark" | "image" | "image-and-text";

/** Horizontal alignment of the primary nav within the header bar. */
export type NavAlignment = "start" | "center" | "end";

/** Content max-width for the header/footer inner container. */
export type ContainerWidth = "standard" | "wide" | "full";

/** Light/dark treatment for chrome that can't be expressed by colour tokens alone. */
export type Appearance = "light" | "dark";

/** A single nav/category link. Mirrors the DB nav_items shape. */
export interface PresentationNavItem {
  label: string;
  href: string;
}

/** Optional announcement bar shown above the header. */
export interface AnnouncementBarConfig {
  enabled: boolean;
  text: string;
  /** Optional link the whole bar points to. Null = not clickable. */
  href: string | null;
}

/** Optional secondary strip of category chips below the header bar. */
export interface CategoryStripConfig {
  enabled: boolean;
  items: PresentationNavItem[];
}

/**
 * Safe, typed header options. Consumed by every header variant so behaviour is
 * consistent and validated regardless of which design is selected.
 */
export interface HeaderConfig {
  logoMode: LogoMode;
  showCta: boolean;
  ctaLabel: string;
  /** Internal path ("/...") or absolute http(s) URL. Validated on load. */
  ctaHref: string;
  announcement: AnnouncementBarConfig;
  categoryStrip: CategoryStripConfig;
  showSearch: boolean;
  sticky: boolean;
  navAlignment: NavAlignment;
  containerWidth: ContainerWidth;
}

/** Safe, typed footer options. */
export interface FooterConfig {
  showNewsletter: boolean;
  containerWidth: ContainerWidth;
}

/**
 * Header design tokens. Each is nullable — a null value means "inherit from the
 * global site theme" so a site that only tweaks the background still gets sane
 * foreground/accent values. Values are CSS colour/length strings validated on
 * load (no url(), expression(), or other CSS injection vectors).
 */
export interface HeaderTokens {
  background: string | null;
  foreground: string | null;
  accent: string | null;
  border: string | null;
  /** CSS length for the header bar height, e.g. "3.5rem" / "64px". */
  height: string | null;
  /** Font family name resolved against the theme font map. */
  fontFamily: string | null;
  appearance: Appearance;
}

/** A complete, validated presentation for a site. */
export interface Presentation {
  headerVariant: LayoutVariant;
  footerVariant: LayoutVariant;
  header: HeaderConfig;
  footer: FooterConfig;
  headerTokens: HeaderTokens;
}

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  logoMode: "wordmark",
  showCta: false,
  ctaLabel: "",
  ctaHref: "/",
  announcement: { enabled: false, text: "", href: null },
  categoryStrip: { enabled: false, items: [] },
  showSearch: true,
  sticky: true,
  navAlignment: "end",
  containerWidth: "standard",
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  showNewsletter: true,
  containerWidth: "standard",
};

export const DEFAULT_HEADER_TOKENS: HeaderTokens = {
  background: null,
  foreground: null,
  accent: null,
  border: null,
  height: null,
  fontFamily: null,
  appearance: "dark",
};

export const CONTAINER_WIDTH_CLASS: Record<ContainerWidth, string> = {
  standard: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export const NAV_ALIGNMENT_CLASS: Record<NavAlignment, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

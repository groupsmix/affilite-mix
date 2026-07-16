/**
 * Runtime validation for presentation config coming from an untrusted source
 * (the DB `site_presentations` record edited via the dashboard or by the
 * automation API). Everything here coerces arbitrary JSON into a fully-typed,
 * safe value with defaults — a malformed or hostile record can never break
 * rendering or inject CSS/markup.
 */
import { isSafeUrl } from "@/lib/sanitize-html";
import {
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_HEADER_TOKENS,
  type Appearance,
  type CategoryStripConfig,
  type ContainerWidth,
  type FooterConfig,
  type HeaderConfig,
  type HeaderTokens,
  type LogoMode,
  type NavAlignment,
  type PresentationNavItem,
} from "@/config/presentation";

const LOGO_MODES: readonly LogoMode[] = ["wordmark", "image", "image-and-text"];
const NAV_ALIGNMENTS: readonly NavAlignment[] = ["start", "center", "end"];
const CONTAINER_WIDTHS: readonly ContainerWidth[] = ["standard", "wide", "full"];
const APPEARANCES: readonly Appearance[] = ["light", "dark"];

const MAX_LABEL_LEN = 120;
const MAX_TEXT_LEN = 200;
const MAX_STRIP_ITEMS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Trim + length-cap a display string. React escapes it, so this only bounds size. */
function cleanText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed.slice(0, max);
}

/** An href is safe if it is an internal path/anchor or an http(s) URL. */
function cleanHref(value: unknown, fallback: string): string {
  if (typeof value === "string" && isSafeUrl(value.trim())) return value.trim();
  return fallback;
}

const SAFE_CSS_TOKEN = /^[a-zA-Z0-9#%.,()\s'"-]{1,120}$/;
const CSS_COLOR_FN = /^(rgb|rgba|hsl|hsla)\([0-9%.,\s/]+\)$/i;

/**
 * Accept only simple colour/length/font-family tokens. Rejects any CSS
 * injection vector: url(), expression(), var(), @import, comments, and the
 * structural characters (`;`, `{`, `}`, `<`, `>`, backslash) that could break
 * out of an inline style value. Function syntax is limited to colour functions.
 */
export function isSafeCssToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!SAFE_CSS_TOKEN.test(s)) return false;
  if (s.includes("(")) return CSS_COLOR_FN.test(s);
  return true;
}

function cssTokenOrNull(value: unknown): string | null {
  return isSafeCssToken(value) ? value.trim() : null;
}

function cleanNavItems(value: unknown, max: number): PresentationNavItem[] {
  if (!Array.isArray(value)) return [];
  const items: PresentationNavItem[] = [];
  for (const raw of value) {
    if (items.length >= max) break;
    if (!isRecord(raw)) continue;
    const label = cleanText(raw.label, MAX_LABEL_LEN, "");
    if (!label) continue;
    if (typeof raw.href !== "string" || !isSafeUrl(raw.href.trim())) continue;
    items.push({ label, href: raw.href.trim() });
  }
  return items;
}

/**
 * Coerce an untrusted record into a HeaderConfig, layering on top of `base`
 * (defaults). Passing the config-resolved value as `base` lets DB overrides
 * win field-by-field while unspecified fields keep the config/default value.
 */
export function resolveHeaderConfig(
  raw: unknown,
  base: HeaderConfig = DEFAULT_HEADER_CONFIG,
): HeaderConfig {
  if (!isRecord(raw)) return base;

  const announcementRaw = isRecord(raw.announcement) ? raw.announcement : {};
  const stripRaw = isRecord(raw.categoryStrip) ? raw.categoryStrip : {};

  const categoryStrip: CategoryStripConfig = {
    enabled: boolOr(stripRaw.enabled, base.categoryStrip.enabled),
    items: Array.isArray(stripRaw.items)
      ? cleanNavItems(stripRaw.items, MAX_STRIP_ITEMS)
      : base.categoryStrip.items,
  };

  return {
    logoMode: enumOr(raw.logoMode, LOGO_MODES, base.logoMode),
    showCta: boolOr(raw.showCta, base.showCta),
    ctaLabel: cleanText(raw.ctaLabel, MAX_LABEL_LEN, base.ctaLabel),
    ctaHref: cleanHref(raw.ctaHref, base.ctaHref),
    announcement: {
      enabled: boolOr(announcementRaw.enabled, base.announcement.enabled),
      text: cleanText(announcementRaw.text, MAX_TEXT_LEN, base.announcement.text),
      href:
        typeof announcementRaw.href === "string"
          ? isSafeUrl(announcementRaw.href.trim())
            ? announcementRaw.href.trim()
            : base.announcement.href
          : base.announcement.href,
    },
    categoryStrip,
    showSearch: boolOr(raw.showSearch, base.showSearch),
    sticky: boolOr(raw.sticky, base.sticky),
    navAlignment: enumOr(raw.navAlignment, NAV_ALIGNMENTS, base.navAlignment),
    containerWidth: enumOr(raw.containerWidth, CONTAINER_WIDTHS, base.containerWidth),
  };
}

export function resolveFooterConfig(
  raw: unknown,
  base: FooterConfig = DEFAULT_FOOTER_CONFIG,
): FooterConfig {
  if (!isRecord(raw)) return base;
  return {
    showNewsletter: boolOr(raw.showNewsletter, base.showNewsletter),
    containerWidth: enumOr(raw.containerWidth, CONTAINER_WIDTHS, base.containerWidth),
  };
}

export function resolveHeaderTokens(
  raw: unknown,
  base: HeaderTokens = DEFAULT_HEADER_TOKENS,
): HeaderTokens {
  if (!isRecord(raw)) return base;
  return {
    background: "background" in raw ? cssTokenOrNull(raw.background) : base.background,
    foreground: "foreground" in raw ? cssTokenOrNull(raw.foreground) : base.foreground,
    accent: "accent" in raw ? cssTokenOrNull(raw.accent) : base.accent,
    border: "border" in raw ? cssTokenOrNull(raw.border) : base.border,
    height: "height" in raw ? cssTokenOrNull(raw.height) : base.height,
    fontFamily: "fontFamily" in raw ? cssTokenOrNull(raw.fontFamily) : base.fontFamily,
    appearance: enumOr(raw.appearance, APPEARANCES, base.appearance),
  };
}

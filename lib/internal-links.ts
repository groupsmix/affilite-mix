import type { ProductRow } from "@/types/database";
import { getTrackingUrl } from "@/lib/tracking-url";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

/* -------------------------------------------------------------------------- */
/* CA-306: automated contextual "related links" builder                        */
/* -------------------------------------------------------------------------- */

/** A single internal link in a related-links block. Always same-origin. */
export interface RelatedLink {
  href: string;
  label: string;
  kind: "hub" | "review" | "comparison" | "alternatives" | "best" | "guide" | "article";
}

/** A titled group of related links (e.g. "Read the full reviews"). */
export interface RelatedLinkGroup {
  title: string;
  links: RelatedLink[];
}

/**
 * Minimal content reference the builder needs. `type` is a plain string (not
 * the strict ContentRow union) so the builder already supports content types
 * that ship later — alternatives/best (CA-301) — without a signature change.
 */
export interface RelatedContentRef {
  id: string;
  title: string;
  slug: string;
  type: string;
}

export interface BuildRelatedLinksInput {
  /** The page we are building links FOR — never linked to itself. */
  current: { id: string; type: string; slug: string };
  language: string;
  /** The category hub this page belongs to, if any. */
  categoryHub?: { slug: string; name: string } | null;
  /**
   * Published content that references the same product(s) as the current page,
   * discovered through the `content_products` join (reviews of the compared
   * tools, comparisons that feature this tool, etc.).
   */
  crossLinked?: RelatedContentRef[];
  /** Same-category published content (already excludes the current page). */
  sameCategory?: RelatedContentRef[];
  /** Max links per group (default 4) and max groups (default 4). */
  perGroup?: number;
}

const GROUP_LABELS: Record<string, { en: string; ar: string }> = {
  hub: { en: "Category", ar: "التصنيف" },
  reviews: { en: "Read the full reviews", ar: "اقرأ المراجعات الكاملة" },
  comparisons: { en: "Head-to-head comparisons", ar: "مقارنات مباشرة" },
  guides: { en: "Alternatives & buying guides", ar: "البدائل وأدلة الشراء" },
  more: { en: "More in this category", ar: "المزيد في هذا التصنيف" },
};

function contentHref(c: { type: string; slug: string }): string {
  return `/${c.type}/${c.slug}`;
}

function toKind(type: string): RelatedLink["kind"] {
  switch (type) {
    case "review":
    case "comparison":
    case "alternatives":
    case "best":
    case "guide":
    case "article":
      return type;
    default:
      return "article";
  }
}

/**
 * Build the contextual internal-link groups for a content page from already
 * fetched data. Pure and deterministic — no DB, no I/O — so it is trivial to
 * unit-test and safe to run during render.
 *
 * Rules (per the SEO silo design):
 *  - **Comparisons** link to the full reviews of the tools they compare, to
 *    other comparisons featuring those tools, and to relevant buying guides.
 *  - **Reviews** link to the head-to-head comparisons featuring the tool and to
 *    alternatives/guides, then fill with siblings from the same category.
 *  - **Every page** links up to its category hub.
 *
 * A given target appears at most once across all groups, and the current page
 * never links to itself. Links are derived from content that actually exists,
 * so the block never emits a dead URL and expands automatically as new content
 * types (alternatives/best — CA-301) are published.
 */
export function buildRelatedLinks(input: BuildRelatedLinksInput): RelatedLinkGroup[] {
  const isAr = input.language === "ar";
  const perGroup = input.perGroup ?? 4;
  const currentHref = contentHref(input.current);
  const seen = new Set<string>([currentHref]);

  const label = (key: keyof typeof GROUP_LABELS | string): string => {
    const entry = GROUP_LABELS[key as string];
    return entry ? (isAr ? entry.ar : entry.en) : (key as string);
  };

  const take = (items: RelatedContentRef[], match: (t: string) => boolean): RelatedLink[] => {
    const out: RelatedLink[] = [];
    for (const c of items) {
      if (out.length >= perGroup) break;
      if (!match(c.type)) continue;
      const href = contentHref(c);
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ href, label: c.title, kind: toKind(c.type) });
    }
    return out;
  };

  const cross = input.crossLinked ?? [];
  const siblings = input.sameCategory ?? [];
  const groups: RelatedLinkGroup[] = [];

  // Up-link to the category hub (skip if the current page IS a hub-less type).
  if (input.categoryHub) {
    const href = `/category/${input.categoryHub.slug}`;
    if (!seen.has(href)) {
      seen.add(href);
      groups.push({
        title: label("hub"),
        links: [{ href, label: input.categoryHub.name, kind: "hub" }],
      });
    }
  }

  if (input.current.type === "comparison") {
    const reviews = take(cross, (t) => t === "review");
    if (reviews.length) groups.push({ title: label("reviews"), links: reviews });
    const comparisons = take(cross, (t) => t === "comparison");
    if (comparisons.length) groups.push({ title: label("comparisons"), links: comparisons });
    const guides = take(cross, (t) => t === "alternatives" || t === "best" || t === "guide");
    if (guides.length) groups.push({ title: label("guides"), links: guides });
  } else if (input.current.type === "review") {
    const comparisons = take(cross, (t) => t === "comparison");
    if (comparisons.length) groups.push({ title: label("comparisons"), links: comparisons });
    const guides = take(cross, (t) => t === "alternatives" || t === "best" || t === "guide");
    if (guides.length) groups.push({ title: label("guides"), links: guides });
  } else {
    // Generic content (article/guide/best/alternatives): surface any cross-links.
    const related = take(cross, () => true);
    if (related.length) groups.push({ title: label("comparisons"), links: related });
  }

  // Fill with same-category siblings so every page has at least one lateral link.
  const more = take(siblings, () => true);
  if (more.length) groups.push({ title: label("more"), links: more });

  return groups;
}

/**
 * Auto-link product name mentions in HTML content body.
 * Links the first AND last occurrence of each product name so readers
 * encounter a clickable link both early and late in long-form content.
 * Skips text already inside <a> tags or HTML attributes.
 *
 * Links point to the internal tracking redirect so clicks are attributed to the
 * product and recorded in the analytics dashboard. The `hasConsent` parameter
 * is kept for API compatibility but is no longer used.
 */
export function injectProductLinks(
  html: string,
  products: ProductRow[],
  hasConsent = true,
): string {
  if (!products.length || !html) return html;

  let result = html;

  for (const product of products) {
    const name = product.name;
    if (!name || name.length < 3) continue;

    // Skip products without an affiliate URL — no tracking link to generate
    if (!hasUsableAffiliateUrl(product.affiliate_url)) continue;

    // Escape special regex characters in product name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Collect all non-anchor text segments with their positions
    const segments = splitAroundAnchors(result);
    const matchPositions = findAllMatches(segments, escaped, result);

    if (matchPositions.length === 0) continue;

    // Determine which occurrences to link: first and last (may be the same)
    const indicesToLink = new Set<number>([0, matchPositions.length - 1]);

    // Replace in reverse order to preserve string positions
    const positionsToReplace = matchPositions
      .map((pos, idx) => ({ ...pos, shouldLink: indicesToLink.has(idx) }))
      .filter((p) => p.shouldLink)
      .reverse();

    for (const pos of positionsToReplace) {
      const linkUrl = getTrackingUrl(product.slug, "inline", product.affiliate_url, hasConsent);
      const link = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer nofollow" class="font-medium hover:underline" style="color:var(--color-accent-text, #10B981)">${pos.matchedText}</a>`;
      result = result.slice(0, pos.start) + link + result.slice(pos.start + pos.matchedText.length);
    }
  }

  return result;
}

interface MatchPosition {
  start: number;
  matchedText: string;
}

/** Split the HTML into segments that are outside <a> tags */
function splitAroundAnchors(html: string): { text: string; offset: number; isAnchor: boolean }[] {
  const anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  const segments: { text: string; offset: number; isAnchor: boolean }[] = [];
  let lastIndex = 0;

  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorPattern.exec(html)) !== null) {
    if (anchorMatch.index > lastIndex) {
      segments.push({
        text: html.slice(lastIndex, anchorMatch.index),
        offset: lastIndex,
        isAnchor: false,
      });
    }
    segments.push({
      text: anchorMatch[0],
      offset: anchorMatch.index,
      isAnchor: true,
    });
    lastIndex = anchorMatch.index + anchorMatch[0].length;
  }

  if (lastIndex < html.length) {
    segments.push({
      text: html.slice(lastIndex),
      offset: lastIndex,
      isAnchor: false,
    });
  }

  return segments;
}

/**
 * Check whether a position in the original HTML falls inside an <a> element
 * by scanning backwards for unclosed anchor tags. This is a safety net on top
 * of splitAroundAnchors to catch edge-cases like inline elements (<strong>,
 * <em>) nested inside anchors.
 */
function isInsideAnchorTag(html: string, position: number): boolean {
  const before = html.slice(0, position);
  const openPattern = /<a\b[^>]*>/gi;
  const closePattern = /<\/a>/gi;

  let openCount = 0;

  while (openPattern.exec(before) !== null) openCount++;
  while (closePattern.exec(before) !== null) openCount--;

  return openCount > 0;
}

/** Find all match positions of the product name in non-anchor segments */
function findAllMatches(
  segments: { text: string; offset: number; isAnchor: boolean }[],
  escapedName: string,
  fullHtml: string,
): MatchPosition[] {
  const positions: MatchPosition[] = [];
  const pattern = new RegExp(`(?<=>|^)([^<]*?)\\b(${escapedName})\\b`, "gi");

  for (const seg of segments) {
    if (seg.isAnchor) continue;

    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(seg.text)) !== null) {
      const matchStart = seg.offset + match.index + match[1]!.length;
      // Double-check: skip if this position is inside an <a> ancestor
      if (isInsideAnchorTag(fullHtml, matchStart)) continue;
      positions.push({
        start: matchStart,
        matchedText: match[2]!,
      });
    }
  }

  return positions;
}

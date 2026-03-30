import type { ProductRow } from "@/types/database";

/**
 * Auto-link product name mentions in HTML content body.
 * Links the first AND last occurrence of each product name so readers
 * encounter a clickable link both early and late in long-form content.
 * Skips text already inside <a> tags or HTML attributes.
 */
export function injectProductLinks(
  html: string,
  products: ProductRow[],
): string {
  if (!products.length || !html) return html;

  let result = html;

  for (const product of products) {
    const name = product.name;
    if (!name || name.length < 3) continue;

    // Skip products without an affiliate URL — no tracking link to generate
    if (!product.affiliate_url) continue;

    // Escape special regex characters in product name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Collect all non-anchor text segments with their positions
    const segments = splitAroundAnchors(result);
    const matchPositions = findAllMatches(segments, escaped);

    if (matchPositions.length === 0) continue;

    // Determine which occurrences to link: first and last (may be the same)
    const indicesToLink = new Set<number>([0, matchPositions.length - 1]);

    // Replace in reverse order to preserve string positions
    const positionsToReplace = matchPositions
      .map((pos, idx) => ({ ...pos, shouldLink: indicesToLink.has(idx) }))
      .filter((p) => p.shouldLink)
      .reverse();

    for (const pos of positionsToReplace) {
      const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&t=inline`;
      const link = `<a href="${trackUrl}" target="_blank" rel="noopener noreferrer nofollow" class="text-emerald-600 font-medium hover:underline">${pos.matchedText}</a>`;
      result =
        result.slice(0, pos.start) +
        link +
        result.slice(pos.start + pos.matchedText.length);
    }
  }

  return result;
}

interface MatchPosition {
  start: number;
  matchedText: string;
}

/** Split the HTML into segments that are outside <a> tags */
function splitAroundAnchors(
  html: string,
): { text: string; offset: number; isAnchor: boolean }[] {
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

/** Find all match positions of the product name in non-anchor segments */
function findAllMatches(
  segments: { text: string; offset: number; isAnchor: boolean }[],
  escapedName: string,
): MatchPosition[] {
  const positions: MatchPosition[] = [];
  const pattern = new RegExp(
    `(?<=>|^)([^<]*?)\\b(${escapedName})\\b`,
    "gi",
  );

  for (const seg of segments) {
    if (seg.isAnchor) continue;

    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(seg.text)) !== null) {
      const matchStart = seg.offset + match.index + match[1].length;
      positions.push({
        start: matchStart,
        matchedText: match[2],
      });
    }
  }

  return positions;
}

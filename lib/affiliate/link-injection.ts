/**
 * Affiliate shortcode link injection.
 *
 * Takes AI-generated HTML and a site's product catalog, matches product names
 * in the body, and turns the first/last mention of each product into a tracked
 * `/r/<product-slug>?ref=<contentSlug>` shortcode link. When the site has a
 * configured tracking key for the product's network (e.g. CJ `sid`), that key
 * is appended to the shortcode so the redirect can tag the outbound URL.
 */

import type { ProductRow } from "@/types/database";
import { defaultDalClientGetter, type DalClientGetter } from "@/lib/dal/dal-client";
import { pickBestAffiliateLink } from "@/lib/dal/product-affiliate-links";
import { getTrackingKeyForSite } from "@/lib/dal/affiliate-tracking-keys";
import { hasUsableAffiliateUrl, isPlaceholderAffiliateUrl } from "@/lib/affiliate-url";
import {
  getNetworkFromUrl,
  getTrackingParamForNetwork,
  toAffiliateNetwork,
  type AffiliateNetwork,
} from "./networks";

export interface InjectAffiliateShortcodeLinksInput {
  siteId: string;
  contentSlug: string;
  html: string;
  products: ProductRow[];
  getClient?: DalClientGetter;
}

export interface InjectAffiliateShortcodeLinksResult {
  html: string;
  linkedProducts: ProductRow[];
}

interface ResolvedAffiliateLink {
  url: string;
  network: AffiliateNetwork | null;
}

interface ProductMention {
  start: number;
  matchedText: string;
}

const SHORTCODE_PATH = "r";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split HTML into segments outside/inside <a> tags. */
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

/** Count unclosed <a> tags before a position. */
function isInsideAnchorTag(html: string, position: number): boolean {
  const before = html.slice(0, position);
  const openPattern = /<a\b[^>]*>/gi;
  const closePattern = /<\/a>/gi;

  let openCount = 0;
  let m: RegExpExecArray | null;

  while ((m = openPattern.exec(before)) !== null) openCount++;
  while ((m = closePattern.exec(before)) !== null) openCount--;

  return openCount > 0;
}

/** Find all non-anchor occurrences of a product name in HTML. */
function findProductMentions(html: string, name: string): ProductMention[] {
  if (!name || name.length < 3) return [];

  const escaped = escapeRegExp(name);
  const segments = splitAroundAnchors(html);
  const pattern = new RegExp(`(?<=>|^)([^<]*?)\\b(${escaped})\\b`, "gi");
  const positions: ProductMention[] = [];

  for (const seg of segments) {
    if (seg.isAnchor) continue;

    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(seg.text)) !== null) {
      const matchStart = seg.offset + match.index + match[1]!.length;
      if (isInsideAnchorTag(html, matchStart)) continue;
      positions.push({
        start: matchStart,
        matchedText: match[2]!,
      });
    }
  }

  return positions;
}

function buildShortcodeUrl(
  productSlug: string,
  contentSlug: string,
  trackingParam: string | null,
  trackingKey: string | null,
): string {
  const params = new URLSearchParams();
  params.set("ref", contentSlug);
  if (trackingParam && trackingKey) {
    params.set(trackingParam, trackingKey);
  }
  return `/${SHORTCODE_PATH}/${encodeURIComponent(productSlug)}?${params.toString()}`;
}

function buildAffiliateAnchor(shortcodeUrl: string, matchedText: string): string {
  return `<a href="${shortcodeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="font-medium hover:underline" style="color:var(--color-accent-text, #10B981)">${matchedText}</a>`;
}

async function resolveProductLink(
  product: ProductRow,
  getClient: DalClientGetter,
): Promise<ResolvedAffiliateLink | null> {
  const bestLink = await pickBestAffiliateLink(product.id, "*", getClient);
  if (bestLink?.url && !isPlaceholderAffiliateUrl(bestLink.url)) {
    const network = toAffiliateNetwork(bestLink.network) ?? getNetworkFromUrl(bestLink.url);
    return { url: bestLink.url, network };
  }

  if (hasUsableAffiliateUrl(product.affiliate_url)) {
    return {
      url: product.affiliate_url,
      network: getNetworkFromUrl(product.affiliate_url),
    };
  }

  return null;
}

/**
 * Inject tracked `/r/<slug>` shortcode links for product mentions in HTML.
 *
 * Returns the transformed HTML and the subset of products that were actually
 * linked. Products without a usable affiliate URL or without a textual match
 * are skipped.
 */
export async function injectAffiliateShortcodeLinks({
  siteId,
  contentSlug,
  html,
  products,
  getClient = defaultDalClientGetter,
}: InjectAffiliateShortcodeLinksInput): Promise<InjectAffiliateShortcodeLinksResult> {
  if (!html || products.length === 0) {
    return { html, linkedProducts: [] };
  }

  // Sort by name length descending so longer names (e.g. "Apple Watch") are
  // linked before shorter substrings (e.g. "Watch").
  const candidates = [...products].sort((a, b) => b.name.length - a.name.length);

  const trackingKeyCache = new Map<string, string | null>();
  const linkedProducts: ProductRow[] = [];
  let result = html;

  for (const product of candidates) {
    const link = await resolveProductLink(product, getClient);
    if (!link) continue;

    const mentions = findProductMentions(result, product.name);
    if (mentions.length === 0) continue;

    let trackingKey: string | null = null;
    let trackingParam: string | null = null;
    if (link.network) {
      trackingParam = getTrackingParamForNetwork(link.network);
      if (trackingParam) {
        const cacheKey = `${link.network}:${trackingParam}`;
        if (!trackingKeyCache.has(cacheKey)) {
          trackingKeyCache.set(
            cacheKey,
            await getTrackingKeyForSite(siteId, link.network, getClient),
          );
        }
        trackingKey = trackingKeyCache.get(cacheKey) ?? null;
      }
    }

    const indicesToLink = new Set<number>([0, mentions.length - 1]);
    const positionsToReplace = mentions
      .map((pos, idx) => ({ ...pos, shouldLink: indicesToLink.has(idx) }))
      .filter((p) => p.shouldLink)
      .reverse();

    for (const pos of positionsToReplace) {
      const shortcodeUrl = buildShortcodeUrl(product.slug, contentSlug, trackingParam, trackingKey);
      const anchor = buildAffiliateAnchor(shortcodeUrl, pos.matchedText);
      result =
        result.slice(0, pos.start) + anchor + result.slice(pos.start + pos.matchedText.length);
    }

    linkedProducts.push(product);
  }

  return { html: result, linkedProducts };
}

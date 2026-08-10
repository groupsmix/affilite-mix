/**
 * Pure, I/O-free aggregation core for the EPC-recompute cron
 * (app/api/cron/epc-recompute/route.ts).
 *
 * T3-F1: a product may have multiple active links per network. EPC must be
 * computed ONCE per link group keyed by (site_id, product_id, network) so that
 * multi-link products neither inflate click counts (a click matching any URL in
 * the group counts once) nor distort EPC. This module exposes the grouping,
 * the per-group deduplicated click count, the commission sum, and the EPC
 * computation as pure functions so they can be exercised without any Supabase
 * or network I/O. The cron route wires these in; `upsertProductEpc` in
 * lib/dal/commissions.ts remains the only upsert seam.
 */

/** A single affiliate link, normalized to the fields the grouping depends on. */
export interface NormalizedAffiliateLink {
  site_id: string;
  product_id: string;
  network: string;
  url: string;
}

/** A Link_Group: all links sharing the same (site_id, product_id, network) tuple. */
export interface LinkGroup {
  site_id: string;
  product_id: string;
  network: string;
  urls: string[];
}

/**
 * Stable, collision-resistant key for the (site_id, product_id, network) tuple.
 * Uses a separator that cannot appear inside the identifier values so distinct
 * tuples never collapse to the same key.
 */
export function linkGroupKey(site_id: string, product_id: string, network: string): string {
  return `${site_id}|${product_id}|${network}`;
}

/**
 * Partition affiliate links into Link_Groups keyed by (site_id, product_id,
 * network). Each link is assigned to exactly one group; groups are disjoint and
 * their union is the original link set. Insertion order of first-seen tuples is
 * preserved (Map iteration order), matching the previous inline behavior.
 *
 * Requirements: 9.1
 */
export function groupAffiliateLinks(
  links: readonly NormalizedAffiliateLink[],
): Map<string, LinkGroup> {
  const groups = new Map<string, LinkGroup>();
  for (const link of links) {
    const key = linkGroupKey(link.site_id, link.product_id, link.network);
    const existing = groups.get(key);
    if (existing) {
      existing.urls.push(link.url);
    } else {
      groups.set(key, {
        site_id: link.site_id,
        product_id: link.product_id,
        network: link.network,
        urls: [link.url],
      });
    }
  }
  return groups;
}

/**
 * The part of an affiliate URL that identifies the destination: everything up
 * to (and excluding) the query string and fragment.
 *
 * Clicks are stored with the URL the visitor was actually sent to, which
 * carries the UTM parameters appended by `affiliateUrlWithUtm()` and the
 * network tracking parameter appended by `/r/[shortcode]`. The configured link
 * URL has none of those, so comparing the two for equality never matches and
 * every group counted zero clicks — which pinned every EPC at zero.
 */
export function affiliateUrlPrefix(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url.split(/[?#]/)[0]?.replace(/\/$/, "") ?? url;
  }
}

/** Deduplicated destination prefixes for a Link_Group. */
export function groupClickPrefixes(urls: readonly string[]): string[] {
  return [...new Set(urls.map(affiliateUrlPrefix))];
}

/**
 * True when a recorded click targets `prefix` — the prefix itself, or the
 * prefix followed by a query string, a fragment or a deeper path segment.
 *
 * The boundary matters: without it `…/dp/B01` would also swallow the clicks of
 * `…/dp/B01XYZ`, attributing one product's traffic to another.
 */
export function clickMatchesPrefix(clickUrl: string, prefix: string): boolean {
  const clicked = affiliateUrlPrefix(clickUrl);
  return clicked === prefix || clicked.startsWith(`${prefix}/`);
}

/**
 * Deduplicated click count for a Link_Group: clicks whose destination matches
 * any of the group's URLs, each click counted at most once. Pure model of the
 * route's count query.
 *
 * Requirements: 9.2, 9.4
 */
export function countGroupClicks(
  clicks: readonly { affiliate_url: string }[],
  urls: readonly string[],
): number {
  const prefixes = groupClickPrefixes(urls);
  let count = 0;
  for (const click of clicks) {
    if (prefixes.some((prefix) => clickMatchesPrefix(click.affiliate_url, prefix))) count++;
  }
  return count;
}

/**
 * PostgREST `or=` filter selecting the click rows that *may* belong to a
 * Link_Group.
 *
 * This is a prefilter, not the decision: PostgREST reads `*` as the LIKE
 * wildcard and offers no ESCAPE clause, so a `%`, `_` or `*` inside a URL can
 * widen the pattern. Widening is harmless because every row it returns is then
 * re-checked with `clickMatchesPrefix`; the filter only has to avoid missing
 * rows.
 */
export function groupClickFilter(urls: readonly string[]): string {
  return groupClickPrefixes(urls)
    .map((prefix) => `affiliate_url.like.${quoteFilterValue(`${prefix}*`)}`)
    .join(",");
}

/** Quote a PostgREST filter value so commas, parentheses and quotes stay literal. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * Sum commission earnings for a group, treating missing/undefined amounts as 0.
 *
 * Requirements: 9.7
 */
export function sumCommissions(
  commissions: readonly { commission_amount?: number | null }[] | null | undefined,
): number {
  if (!commissions) return 0;
  return commissions.reduce((sum, c) => sum + Number(c?.commission_amount ?? 0), 0);
}

/**
 * Round a non-negative value half-up to 2 decimal places. EPC inputs (earnings
 * and clicks) are non-negative, so half-up here means rounding a trailing .5 at
 * the third decimal away from zero (toward +Infinity). The `Number.EPSILON`
 * nudge corrects the common binary-float underestimation (e.g. 1.005 stored as
 * 1.00499999…) so it rounds up to 1.01 rather than down to 1.00.
 */
function roundHalfUpTo2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * EPC for a group: earnings divided by total clicks, rounded half-up to 2
 * decimal places, when clicks > 0; otherwise 0 (no division error).
 * Missing/undefined earnings are treated as 0.
 *
 * Requirements: 9.5, 9.6, 9.7
 */
export function computeEpc(earnings: number | null | undefined, clicks: number): number {
  const total = Number(earnings ?? 0);
  return clicks > 0 ? roundHalfUpTo2(total / clicks) : 0;
}

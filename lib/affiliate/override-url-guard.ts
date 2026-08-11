import { getNetworkFromUrl, type AffiliateNetwork } from "./networks";

/**
 * Guard for client-supplied affiliate destinations (`?u=` on
 * /api/track/click).
 *
 * The destination of a click normally comes from the database, which only an
 * admin can write. Config-driven catalogs (dial guides, calm-routine picks,
 * the tool directory) have no product row, so their CTAs pass the destination
 * in the query string instead. That parameter is attacker-controllable: the
 * HTTPS + domain allow-list checks alone let a third party turn the site into
 * a redirector for any allow-listed host, and swap the publisher identity so
 * the site's traffic earns someone else's commission.
 *
 * This module narrows what an unsigned override may be. It is a mitigation,
 * not a replacement for signing the destination — a signed `(p, u)` pair is
 * the durable fix and requires threading a server-computed signature through
 * the CTA components.
 */

export interface OverrideUrlCheck {
  allowed: boolean;
  /** Machine-readable rejection reason, `null` when allowed. */
  reason: string | null;
}

const ALLOWED: OverrideUrlCheck = { allowed: true, reason: null };

/**
 * Networks whose links are redirectors: the destination lives inside the URL
 * (`awin1.com/cread.php?ued=`, `shareasale.com/r.cfm?urllink=`), so allow-listing
 * the host says nothing about where the user ends up. Deep links for these
 * networks are admin-entered and reach the redirect through the database path,
 * never through `?u=`.
 */
const REDIRECTOR_NETWORKS = new Set<AffiliateNetwork>([
  "cj",
  "shareasale",
  "awin",
  "rakuten",
  "impact",
  "clickbank",
  "partnerstack",
  "admitad",
]);

/** Link shorteners: opaque by design, so the final destination is unknowable here. */
const OPAQUE_HOSTS = new Set(["amzn.to", "amzn.com", "hop.clickbank.net", "rover.ebay.com"]);

/**
 * Publisher-identity parameter per network, paired with the environment
 * variable holding this site's own value. When the site has an identity
 * configured, an override carrying a *different* one is a commission
 * substitution attempt.
 */
const IDENTITY_PARAMS: { network: AffiliateNetwork; param: string; envValue: () => string }[] = [
  {
    network: "amazon",
    param: "tag",
    envValue: () =>
      process.env.AMAZON_ASSOCIATE_TAG || process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || "",
  },
];

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** True when a query value or fragment smuggles another absolute URL. */
function carriesEmbeddedUrl(url: URL): boolean {
  for (const value of url.searchParams.values()) {
    const decoded = decodeOnce(value);
    if (/https?:\/\//i.test(decoded) || /^\s*\/\//.test(decoded)) return true;
  }
  return /https?:\/\//i.test(decodeOnce(url.hash));
}

function hostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Validate a destination supplied through the `u=` query parameter. Runs in
 * addition to — not instead of — the HTTPS check and the affiliate domain
 * allow-list.
 */
export function validateOverrideDestination(rawUrl: string): OverrideUrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "unparsable_url" };
  }

  if (url.protocol !== "https:") {
    return { allowed: false, reason: "non_https_scheme" };
  }

  if (OPAQUE_HOSTS.has(hostname(url))) {
    return { allowed: false, reason: "opaque_redirector_host" };
  }

  const network = getNetworkFromUrl(rawUrl);
  if (network && REDIRECTOR_NETWORKS.has(network)) {
    return { allowed: false, reason: `redirector_network:${network}` };
  }

  if (carriesEmbeddedUrl(url)) {
    return { allowed: false, reason: "embedded_absolute_url" };
  }

  for (const identity of IDENTITY_PARAMS) {
    if (network !== identity.network) continue;
    const expected = identity.envValue();
    if (!expected) continue;
    const supplied = url.searchParams.get(identity.param);
    if (supplied !== null && supplied !== expected) {
      return { allowed: false, reason: `foreign_publisher_id:${identity.param}` };
    }
  }

  return ALLOWED;
}

/**
 * Accept both the historical double-encoded form of `u=` and the plain one.
 *
 * `lib/tracking-url.ts` used to encode the destination twice, while the route
 * decodes only once (URLSearchParams). Every CTA built that way redirected to
 * a 400 instead of the merchant. The producer no longer double-encodes, but
 * links already rendered into cached pages, feeds and inboxes still carry the
 * old shape, so a single extra decode is applied when — and only when — the
 * raw value is not already a URL.
 */
export function normalizeOverrideUrl(raw: string): string | null {
  const candidate = raw.trim();
  if (!candidate) return null;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    // fall through to the legacy double-encoded form
  }
  const decoded = decodeOnce(candidate);
  if (decoded === candidate) return null;
  try {
    new URL(decoded);
    return decoded;
  } catch {
    return null;
  }
}

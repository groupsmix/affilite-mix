/**
 * Pure, isomorphic helpers for deciding whether a persisted affiliate URL is
 * real enough to show to visitors or to allow on an active product.
 *
 * These checks are intentionally conservative: a placeholder string like
 * "https://amazon.com/dp/example" is not a live affiliate link, and an active
 * product that exposes it will dead-end users. Drafts may still store
 * placeholders while links are being sourced.
 */

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "www.example.com",
  "example.org",
  "www.example.org",
  "example.net",
  "www.example.net",
  "test.com",
  "www.test.com",
  "localhost",
  "127.0.0.1",
]);

const PLACEHOLDER_PATH_SEGMENT_RE =
  /(^|\/)(example|placeholder|sample|todo|tbd|fixme|your-affiliate|test-link|dummy-link)(?:[/?#]|$)/i;

/** Detect URLs that are clearly placeholders or deliberately non-routable. */
export function isPlaceholderAffiliateUrl(url: string | null | undefined): boolean {
  if (url === undefined || url === null) return true;
  const raw = url.trim();
  if (raw === "") return true;

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (PLACEHOLDER_HOSTS.has(hostname)) return true;
    const path = parsed.pathname + parsed.search + parsed.hash;
    if (PLACEHOLDER_PATH_SEGMENT_RE.test(path)) return true;
  } catch {
    // Malformed URLs that are not empty are still placeholders — they cannot
    // be followed. The admin/guard layers will also reject malformed HTTPS URLs.
    return true;
  }

  return false;
}

/** A URL is usable for a public CTA when it is present and not a placeholder. */
export function hasUsableAffiliateUrl(url: string | null | undefined): boolean {
  return !isPlaceholderAffiliateUrl(url);
}

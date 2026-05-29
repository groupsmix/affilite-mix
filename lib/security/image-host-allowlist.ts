/**
 * S11-001 — Image-host allowlist for user-submitted URLs.
 *
 * Public (non-admin) endpoints that accept image URLs from end-users must
 * restrict the hostname to a known set of trusted image hosts. This
 * prevents stored SSRF, user-tracking via unique URLs, and phishing
 * through attacker-controlled image domains rendered on a trusted origin.
 *
 * The allowlist is built at module load from environment variables and the
 * static site config. It intentionally does NOT fall back to "allow all"
 * when R2_PUBLIC_URL is unset — in that scenario only the other
 * statically-known CDN hosts are accepted.
 */

function hostnameFromEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function buildAllowedImageHosts(): Set<string> {
  const hosts: (string | null)[] = [
    hostnameFromEnv("R2_PUBLIC_URL"),
    hostnameFromEnv("NEXT_PUBLIC_SUPABASE_URL"),
    // G-48: Amazon CDN hostnames — mirrors next.config.ts remotePatterns.
    "m.media-amazon.com",
    "images-na.ssl-images-amazon.com",
  ];
  return new Set(hosts.filter(Boolean) as string[]);
}

let _cache: Set<string> | null = null;

/** Lazily-built set of allowed image hostnames (lower-cased). */
export function getAllowedImageHosts(): Set<string> {
  if (!_cache) _cache = buildAllowedImageHosts();
  return _cache;
}

/** Reset the cached set (for tests that mutate env vars). */
export function _resetAllowedImageHostsCache(): void {
  _cache = null;
}

export interface ImageHostCheckResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a *parsed* URL hostname is on the image-host allowlist.
 * Callers are responsible for prior protocol / length checks; this
 * function ONLY checks the hostname.
 */
export function checkImageHostAllowlist(hostname: string): ImageHostCheckResult {
  const allowed = getAllowedImageHosts();
  if (allowed.size === 0) {
    return { valid: false, error: "No image hosts are configured" };
  }
  if (!allowed.has(hostname.toLowerCase())) {
    return { valid: false, error: "image_url must be hosted on an approved domain" };
  }
  return { valid: true };
}

/**
 * G-01 — Admin write-time URL validation.
 *
 * When an admin writes a URL-typed field (affiliate_url, image_url,
 * logo_url, og_image, featured_image, canonical_url, etc.) we want to
 * reject the payload BEFORE it is persisted if the URL is:
 *
 *   - malformed
 *   - a scheme other than https (http: allowed in dev only)
 *   - a wildcard-DNS / DNS-rebinding TLD
 *   - a literal private / loopback / metadata IP
 *
 * We deliberately do NOT do async DNS lookup here (that is
 * `validateExternalUrl` in lib/ssrf-guard.ts, which is for call sites
 * that are *about* to fetch the URL). Admin writes only need scheme +
 * literal-IP + wildcard-DNS checks; the DNS-based guard is still run
 * whenever the server actually fetches the persisted URL (metadata
 * scraper, price-scrape cron, outbound webhook, etc.).
 *
 * Contract:
 *   - Empty / null / undefined input → `{ valid: true }`. Optional URL
 *     fields are allowed to be empty; call sites that require a URL
 *     should check presence separately.
 *   - Any other shape is validated synchronously and returns either
 *     `{ valid: true, normalized }` (URL.toString() output) or
 *     `{ valid: false, error }`.
 */

export interface AdminUrlValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/** Wildcard-DNS services commonly used in SSRF / rebinding bypasses. */
const WILDCARD_DNS_SUFFIXES = [
  ".nip.io",
  ".sslip.io",
  ".localtest.me",
  ".xip.io",
  ".vcap.me",
  ".internal",
];

/** TLDs that point at internal / local networks or anonymity networks. */
const REBINDING_TLDS = [".arpa", ".local", ".localhost", ".test", ".invalid", ".onion"];

/** Hostnames known to expose cloud instance metadata or internal services. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "::1",
  "::ffff:7f00:1", // IPv6-mapped 127.0.0.1
  "::ffff:a9fe:a9fe", // IPv6-mapped 169.254.169.254 (AWS/GCP/Azure metadata)
  "metadata.google.internal",
  "metadata.internal",
  "metadata.azure.com",
  "169.254.169.254",
  "100.100.100.100",
]);

/** Parse "a.b.c.d" → number | null. */
function ipv4ToNumber(raw: string): number | null {
  const m = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

const PRIVATE_IPV4_RANGES: Array<[number, number]> = (
  [
    ["10.0.0.0", 8],
    ["127.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["169.254.0.0", 16],
    ["0.0.0.0", 8],
    ["100.64.0.0", 10],
  ] as Array<[string, number]>
).map(([cidr, bits]) => {
  const base = ipv4ToNumber(cidr) ?? 0;
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return [base & mask, mask] as [number, number];
});

function ipv4IsPrivate(ip: string): boolean {
  const n = ipv4ToNumber(ip);
  if (n === null) return false;
  return PRIVATE_IPV4_RANGES.some(([base, mask]) => (n & mask) === base);
}

/**
 * If the hostname is an IPv6-mapped IPv4 address (::ffff:a.b.c.d or
 * ::ffff:AABB:CCDD), return the dotted-quad IPv4 equivalent; otherwise
 * return null. Mirrors the helper in lib/ssrf-guard.ts so admin writes
 * catch IPv4 SSRF targets cloaked as IPv6 literals.
 */
function ipv6MappedToIPv4(hostname: string): string | null {
  const dotted = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotted) return dotted[1];

  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
  }

  return null;
}

function ipv6IsPrivateOrReserved(raw: string): boolean {
  const h = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:AABB:CCDD): defer to the
  // IPv4 private-range check on the embedded address. Without this the
  // first-hextet regex below rejects the empty head and waves through
  // ::ffff:127.0.0.1, ::ffff:169.254.169.254, etc.
  const mappedV4 = ipv6MappedToIPv4(h);
  if (mappedV4 !== null && ipv4IsPrivate(mappedV4)) return true;

  // fc00::/7 and fe80::/10
  const firstColon = h.indexOf(":");
  const headRaw = h.slice(0, firstColon);
  if (!/^[0-9a-f]{1,4}$/.test(headRaw)) return false;
  const head = parseInt(headRaw, 16);
  const highByte = (head >> 8) & 0xff;
  if (highByte === 0xfc || highByte === 0xfd) return true;
  if (head >= 0xfe80 && head <= 0xfebf) return true;

  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export interface AdminUrlValidationOptions {
  /**
   * Allow http:// in addition to https://. Only set for fields where
   * non-TLS external URLs are intentionally tolerated (typically never
   * in production). Defaults to false.
   */
  allowHttp?: boolean;
  /**
   * Allow relative URLs / protocol-relative URLs. Only set for fields
   * that may legitimately hold a site-relative path (rare). Defaults
   * to false — admin URL fields are always absolute in this codebase.
   */
  allowRelative?: boolean;
}

/**
 * Synchronously validate a URL string supplied by an admin write. See
 * the module docstring for the contract. Returns `{ valid: true }` for
 * empty / null / undefined input.
 */
export function validateAdminUrl(
  input: string | null | undefined,
  options: AdminUrlValidationOptions = {},
): AdminUrlValidationResult {
  if (input === null || input === undefined) return { valid: true };
  const raw = String(input).trim();
  if (raw === "") return { valid: true };

  // Reject obvious control characters and whitespace before parsing.
  // URL() itself will fail on most of these but the error message is
  // clearer if we surface them explicitly.
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) {
    return { valid: false, error: "URL contains whitespace or control characters" };
  }

  if (raw.length > 2048) {
    return { valid: false, error: "URL exceeds 2048 character limit" };
  }

  if (
    options.allowRelative &&
    (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../"))
  ) {
    return { valid: true, normalized: raw };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // fail-closed: malformed URL is rejected [criticality:defence-in-depth]
    return { valid: false, error: "URL is malformed" };
  }

  const allowedProtocols = options.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: `URL scheme '${url.protocol}' is not allowed (must be https:)`,
    };
  }

  // Reject embedded credentials (user:pass@host) — admin writes should
  // never carry these.
  if (url.username || url.password) {
    return { valid: false, error: "URL must not contain credentials" };
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return { valid: false, error: "URL is missing a hostname" };
  }

  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `Hostname '${hostname}' is blocked` };
  }

  for (const suffix of WILDCARD_DNS_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { valid: false, error: `Wildcard DNS '${suffix}' is blocked` };
    }
  }
  for (const tld of REBINDING_TLDS) {
    if (hostname.endsWith(tld)) {
      return { valid: false, error: `TLD '${tld}' is blocked (SSRF risk)` };
    }
  }

  // Literal IPv4 in private range?
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && ipv4IsPrivate(hostname)) {
    return { valid: false, error: `IP '${hostname}' is in a blocked range` };
  }

  // Literal IPv6 in private / link-local range?
  if (hostname.includes(":") && ipv6IsPrivateOrReserved(hostname)) {
    return { valid: false, error: `IPv6 '${hostname}' is in a blocked range` };
  }

  return { valid: true, normalized: url.toString() };
}

/**
 * Helper for routes that want to validate a record of URL fields at
 * once and return the first failing field. Returns null on full
 * success. Example:
 *
 *     const err = validateAdminUrlFields({
 *       affiliate_url: data.affiliate_url,
 *       image_url: data.image_url,
 *     });
 *     if (err) return apiError(400, err.error);
 */
export function validateAdminUrlFields(
  fields: Record<string, string | null | undefined>,
  options: AdminUrlValidationOptions = {},
): { field: string; error: string } | null {
  for (const [field, value] of Object.entries(fields)) {
    const r = validateAdminUrl(value, options);
    if (!r.valid) return { field, error: `${field}: ${r.error}` };
  }
  return null;
}

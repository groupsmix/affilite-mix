import { fetchWithTimeout } from "@/lib/fetch-timeout";
/**
 * SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Use validateExternalUrl() before making any fetch() call with a URL that
 * could originate from user input. This prevents attackers from making the
 * server fetch internal resources (metadata endpoints, cloud instance IPs,
 * internal APIs, etc.).
 *
 * F-036: SSRF guard for URLs
 */

import { logger } from "./logger";
import dns from "node:dns";
import { promisify } from "node:util";

const lookupAsync = promisify(dns.lookup);

// Blocked hostnames / IP ranges
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "::1",
  "::ffff:7f00:1", // IPv6-mapped 127.0.0.1
  "::ffff:a9fe:a9fe", // IPv6-mapped 169.254.169.254 (AWS/GCP/Azure metadata)
  "metadata.google.internal", // GCP metadata
  "metadata.internal", // Generic cloud metadata
  "169.254.169.254", // AWS/GCP/Azure metadata endpoint
  "metadata.azure.com",
  "100.100.100.100", // Alibaba Cloud metadata
]);

// Blocked CIDR ranges (IPv4)
const BLOCKED_IP_RANGES = [
  "10.0.0.0/8",
  "127.0.0.0/8", // Loopback
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16", // Link-local / metadata
  "0.0.0.0/8", // "This" network
];

/**
 * Normalize a URL.hostname value. For IPv6 literals Node's URL parser
 * returns the address wrapped in square brackets (e.g. "[::1]"); strip
 * those so the value matches BLOCKED_HOSTS entries and can be compared
 * against IPv6-mapped IPv4 addresses.
 */
function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/**
 * If the hostname is an IPv6-mapped IPv4 address (::ffff:a.b.c.d or
 * ::ffff:AABB:CCDD), return the dotted-quad IPv4 equivalent; otherwise
 * return null.
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

/**
 * Parse a CIDR like "10.0.0.0/8" and check if an IP falls within it.
 */
function ipInRange(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);

  const ipParts = ip.split(".").map(Number);
  const rangeParts = range.split(".").map(Number);

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];

  const rangeNum =
    (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

  const mask = (-1 << (32 - bits)) >>> 0;

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Resolve hostname and check for blocked IPs.
 */
function resolveAndValidate(hostname: string, checked = new Set<string>()): boolean {
  const normalized = normalizeHostname(hostname);

  // Prevent DNS rebinding / infinite loops
  if (checked.has(normalized)) return false;
  checked.add(normalized);

  // Blocklist check
  if (BLOCKED_HOSTS.has(normalized)) return false;

  // IPv6-mapped IPv4: validate the embedded IPv4 against CIDR ranges
  const mapped = ipv6MappedToIPv4(normalized);
  if (mapped) {
    for (const cidr of BLOCKED_IP_RANGES) {
      if (ipInRange(mapped, cidr)) return false;
    }
    return true;
  }

  // Parse IPv4
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = normalized.match(ipv4Regex);
  if (match) {
    const ip = match.slice(1).join(".");
    for (const cidr of BLOCKED_IP_RANGES) {
      if (ipInRange(ip, cidr)) return false;
    }
    return true;
  }

  // For non-IP hostnames, allow resolution (DNS rebinding risk is mitigated
  // by also validating the resolved IP against BLOCKED_IP_RANGES above).
  // In a production hardening pass, consider using a DNS-over-HTTPS resolver
  // with DNSSEC and a short TTL check — or resolve eagerly and compare.
  return true;
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a URL is safe to fetch (not an SSRF attack vector).
 *
 * Returns { valid: true } or { valid: false, error: "..." }.
 *
 * @param urlString - The URL to validate
 * @param allowPrivateIPs - Set to true only for internal tools with explicit
 *                          security controls; defaults to false (fail-safe).
 */
export async function validateExternalUrl(
  urlString: string,
  allowPrivateIPs = false,
): Promise<UrlValidationResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow https (and http for explicit internal cases)
  const allowedProtocols = allowPrivateIPs ? ["http:", "https:"] : ["https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    return { valid: false, error: `Protocol '${url.protocol}' is not allowed` };
  }

  const hostname = normalizeHostname(url.hostname);

  // Block wildcard DNS services used for DNS rebinding/SSRF bypass
  const WILDCARD_DNS = [
    ".nip.io",
    ".sslip.io",
    ".localtest.me",
    ".xip.io",
    ".vcap.me",
    ".internal",
  ];
  for (const suffix of WILDCARD_DNS) {
    if (hostname.endsWith(suffix)) {
      return { valid: false, error: `Wildcard DNS '${suffix}' is blocked` };
    }
  }

  // Blocklist check
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `Hostname '${hostname}' is blocked` };
  }

  // IPv6-mapped IPv4 (e.g. ::ffff:7f00:1): check the embedded IPv4 address
  const mapped = ipv6MappedToIPv4(hostname);
  if (mapped) {
    for (const cidr of BLOCKED_IP_RANGES) {
      if (ipInRange(mapped, cidr)) {
        return { valid: false, error: `IP range '${cidr}' is blocked (SSRF risk)` };
      }
    }
  }

  // CIDR range check
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    const ip = match.slice(1).join(".");
    for (const cidr of BLOCKED_IP_RANGES) {
      if (ipInRange(ip, cidr)) {
        return { valid: false, error: `IP range '${cidr}' is blocked (SSRF risk)` };
      }
    }
  }

  // Domain-to-IP resolution with rebinding check (lightweight approach)
  // For user-supplied URLs, we resolve and validate; fail-closed on errors
  try {
    // Skip DNS resolution for IP literals (already checked above)
    if (
      !hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/) &&
      !ipv6MappedToIPv4(hostname)
    ) {
      const { address } = await lookupAsync(hostname);

      // Check if the resolved IP is in blocked ranges
      const ipMatch = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipMatch) {
        const ip = ipMatch.slice(1).join(".");
        for (const cidr of BLOCKED_IP_RANGES) {
          if (ipInRange(ip, cidr)) {
            return { valid: false, error: `Resolved IP range \'${cidr}\' is blocked (SSRF risk)` };
          }
        }
      }
    }
  } catch (err) {
    // If resolution fails, log and block (fail-closed)
    logger.warn("SSRF guard: DNS resolution failed for hostname", { hostname, error: String(err) });
    return { valid: false, error: "DNS resolution failed — blocked" };
  }

  return { valid: true };
}

/**
 * Wrapper around fetch() that validates the URL before making the request.
 * Use this instead of raw fetch() when the URL may contain user input.
 *
 * @param urlString - The URL to fetch
 * @param options - Standard fetch options
 * @param allowPrivateIPs - Only set true for internal tooling
 */
export async function safeFetch(
  urlString: string,
  options?: RequestInit,
  allowPrivateIPs = false,
): Promise<Response> {
  const result = await validateExternalUrl(urlString, allowPrivateIPs);
  if (!result.valid) {
    logger.warn("SSRF blocked", { url: urlString, reason: result.error });
    throw new Error(`SSRF guard: ${result.error}`);
  }

  return fetchWithTimeout(urlString, {
    timeoutMs: 15000, // Default 15s timeout to prevent hanging
    ...options,
  });
}

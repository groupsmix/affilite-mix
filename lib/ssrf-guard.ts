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

const lookupAsyncRaw = promisify(dns.lookup);

/** T1-01 / P7-03: Wrap dns.lookup with a timeout to prevent resolver stalls. */
const DNS_TIMEOUT_MS = 5_000;
function lookupAsync(hostname: string): Promise<{ address: string; family: number }> {
  return Promise.race([
    lookupAsyncRaw(hostname),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timed out")), DNS_TIMEOUT_MS),
    ),
  ]);
}

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
  "100.64.0.0/10", // Carrier-grade NAT (RFC 6598)
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
  if (dotted) return dotted[1]!;

  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1]!, 16);
    const low = parseInt(hex[2]!, 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
  }

  return null;
}

/**
 * Check whether an IPv6 hostname falls into a private/blocked prefix:
 *   - fe80::/10  link-local
 *   - fc00::/7   unique-local addresses (covers fd00::/8)
 * Returns true if the address must be blocked.
 *
 * The check is conservative: any address whose first hextet matches the
 * prefix is rejected, regardless of the rest of the address.
 */
function isBlockedIPv6Prefix(hostname: string): boolean {
  // Must contain a colon to be an IPv6 literal at all.
  if (!hostname.includes(":")) return false;

  // Take the first hextet (chars before the first colon).
  const firstColon = hostname.indexOf(":");
  const headRaw = hostname.slice(0, firstColon).toLowerCase();
  if (headRaw.length === 0 || !/^[0-9a-f]{1,4}$/.test(headRaw)) return false;

  const head = parseInt(headRaw, 16);

  // fc00::/7 — first 7 bits are 1111 110x → first byte is 0xfc or 0xfd.
  // The first hextet's high byte equals (head >> 8).
  const highByte = (head >> 8) & 0xff;
  if (highByte === 0xfc || highByte === 0xfd) return true;

  // fe80::/10 — first 10 bits are 1111 1110 10. The first hextet is
  // 0xfe80–0xfebf inclusive.
  if (head >= 0xfe80 && head <= 0xfebf) return true;

  return false;
}

/**
 * Parse a CIDR like "10.0.0.0/8" and check if an IP falls within it.
 */
function ipInRange(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr!, 10);

  const ipParts = ip.split(".").map(Number);
  const rangeParts = range!.split(".").map(Number);

  const ipNum = (ipParts[0]! << 24) | (ipParts[1]! << 16) | (ipParts[2]! << 8) | ipParts[3]!;

  const rangeNum =
    (rangeParts[0]! << 24) | (rangeParts[1]! << 16) | (rangeParts[2]! << 8) | rangeParts[3]!;

  const mask = (-1 << (32 - bits)) >>> 0;

  return (ipNum & mask) === (rangeNum & mask);
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  /**
   * A1-04: The IP address the hostname resolved to during validation.
   * Present when the URL contains a hostname (not a bare IP literal) and
   * DNS resolution succeeded.  Callers should rewrite the fetch URL to use
   * this IP and pass the original hostname in the `Host` header so no second
   * DNS lookup occurs, eliminating the DNS-rebinding TOCTOU window.
   */
  resolvedIp?: string;
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
    // fail-closed: malformed URL is rejected [criticality:security-critical]
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
  // FIX-25 (F-036): Also block DNS rebinding-friendly TLDs
  const REBINDING_TLDS = [".arpa", ".local", ".localhost", ".test", ".invalid", ".onion"];
  for (const suffix of WILDCARD_DNS) {
    if (hostname.endsWith(suffix)) {
      return { valid: false, error: `Wildcard DNS '${suffix}' is blocked` };
    }
  }
  for (const tld of REBINDING_TLDS) {
    if (hostname.endsWith(tld)) {
      return { valid: false, error: `TLD '${tld}' is blocked (SSRF risk)` };
    }
  }

  // Blocklist check
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `Hostname '${hostname}' is blocked` };
  }

  // IPv6 link-local (fe80::/10) and unique-local (fc00::/7) ranges.
  if (isBlockedIPv6Prefix(hostname)) {
    return {
      valid: false,
      error: `IPv6 private/link-local address '${hostname}' is blocked (SSRF risk)`,
    };
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

  // A1-04: DNS-rebinding TOCTOU mitigation.
  //
  // Naive guards validate the hostname, then let the runtime make a second DNS
  // lookup when the actual fetch() happens.  A DNS-rebinding attacker can
  // return a safe public IP for the first lookup (passing validation) and a
  // private IP for the second (hitting the metadata endpoint).
  //
  // Fix: resolve the hostname exactly once here, validate the resulting IP,
  // then return the resolved IP alongside the original URL so callers can
  // rewrite the URL to fetch-by-IP (with the Host header preserved), making
  // further DNS lookups impossible.
  if (
    !hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/) &&
    !ipv6MappedToIPv4(hostname)
  ) {
    let resolvedIp: string;
    try {
      const { address } = await lookupAsync(hostname);
      resolvedIp = address;
    } catch (err) {
      // Fail-closed: if resolution fails, block the request.
      logger.warn("SSRF guard: DNS resolution failed for hostname", {
        hostname,
        error: String(err),
      });
      return { valid: false, error: "DNS resolution failed — blocked" };
    }

    // Validate the resolved IP against the blocked ranges.
    const ipMatch = resolvedIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const ip = ipMatch.slice(1).join(".");
      for (const cidr of BLOCKED_IP_RANGES) {
        if (ipInRange(ip, cidr)) {
          return {
            valid: false,
            error: `Resolved IP range '${cidr}' is blocked (SSRF risk)`,
          };
        }
      }
    }

    // T1-01: Validate resolved IPv6 addresses against private/link-local ranges.
    // Previously, only the input hostname was checked for IPv6 prefixes; a
    // hostname resolving to an AAAA record (e.g. fd00::1) would slip through.
    if (isBlockedIPv6Prefix(resolvedIp)) {
      return {
        valid: false,
        error: `Resolved IPv6 address '${resolvedIp}' is in a private/link-local range (SSRF risk)`,
      };
    }

    // Also check IPv6-mapped IPv4 in the resolved address.
    const resolvedMapped = ipv6MappedToIPv4(resolvedIp);
    if (resolvedMapped) {
      for (const cidr of BLOCKED_IP_RANGES) {
        if (ipInRange(resolvedMapped, cidr)) {
          return {
            valid: false,
            error: `Resolved IPv6-mapped IPv4 '${resolvedMapped}' falls in blocked range '${cidr}'`,
          };
        }
      }
    }

    // Also block the resolved IP against the hostname blocklist.
    if (BLOCKED_HOSTS.has(resolvedIp)) {
      return { valid: false, error: `Resolved IP '${resolvedIp}' is blocked` };
    }

    // Return the resolved IP so the caller can pin the fetch to this IP,
    // preventing a second DNS lookup from returning a different address.
    return { valid: true, resolvedIp };
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
/**
 * FIX-25 (F-036): Post-redirect SSRF validation.
 *
 * DNS rebinding attacks work by serving a legitimate IP on the first
 * DNS lookup (passing validation) and a private IP on the second
 * (after redirect). This wrapper validates the final URL after
 * following redirects.
 *
 * Use this for high-risk fetches where the URL comes from untrusted
 * input and the response is used in a security-sensitive context.
 */
/** Maximum number of redirects to follow before aborting (P-02). */
const MAX_REDIRECT_HOPS = 10;

export interface SafeFetchRedirectResult {
  response: Response;
  finalUrl: string;
  redirectHops: number;
}

async function fetchWithRedirectMetadataInternal(
  urlString: string,
  options?: RequestInit,
  allowPrivateIPs = false,
  _hopsRemaining: number = MAX_REDIRECT_HOPS,
  _redirectHops = 0,
): Promise<SafeFetchRedirectResult> {
  if (_hopsRemaining <= 0) {
    throw new Error("SSRF guard: too many redirects");
  }

  const result = await validateExternalUrl(urlString, allowPrivateIPs);
  if (!result.valid) {
    logger.warn("SSRF blocked", { url: urlString, reason: result.error });
    throw new Error(`SSRF guard: ${result.error}`);
  }

  // A1-04: Pin the fetch to the resolved IP so no second DNS lookup happens.
  // Rewrite the URL to use the resolved IP address and add the original
  // hostname as the Host header, making DNS rebinding impossible.
  let fetchUrl = urlString;
  const extraHeaders: Record<string, string> = {};
  if (result.resolvedIp) {
    try {
      const parsed = new URL(urlString);
      const originalHostname = parsed.hostname;
      parsed.hostname = result.resolvedIp;
      fetchUrl = parsed.toString();
      extraHeaders["Host"] = originalHostname;
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Malformed URL — validateExternalUrl already checked it, so this
      // should be unreachable; fall back to the original URL.
    }
  }

  // R10-02: Set redirect:"manual" AFTER the spread so callers cannot
  // accidentally re-enable auto-follow and bypass per-hop SSRF validation.
  const mergedOptions: RequestInit & { timeoutMs: number } = {
    timeoutMs: 15000,
    ...options,
    redirect: "manual", // Don't auto-follow; validate each redirect
    headers: {
      ...(options?.headers as Record<string, string> | undefined),
      ...extraHeaders,
    },
  };

  const response = await fetchWithTimeout(fetchUrl, mergedOptions);

  // Validate redirect chain
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const redirectResult = await validateExternalUrl(location, allowPrivateIPs);
      if (!redirectResult.valid) {
        logger.warn("SSRF blocked on redirect", { url: location, reason: redirectResult.error });
        throw new Error(`SSRF guard on redirect: ${redirectResult.error}`);
      }
      // Re-fetch the redirect target with the same validation
      return fetchWithRedirectMetadataInternal(
        location,
        options,
        allowPrivateIPs,
        _hopsRemaining - 1,
        _redirectHops + 1,
      );
    }
  }

  return { response, finalUrl: urlString, redirectHops: _redirectHops };
}

export async function safeFetchWithRedirectValidation(
  urlString: string,
  options?: RequestInit,
  allowPrivateIPs = false,
): Promise<Response> {
  const result = await fetchWithRedirectMetadataInternal(urlString, options, allowPrivateIPs);
  return result.response;
}

export async function safeFetchWithRedirectMetadata(
  urlString: string,
  options?: RequestInit,
  allowPrivateIPs = false,
): Promise<SafeFetchRedirectResult> {
  return fetchWithRedirectMetadataInternal(urlString, options, allowPrivateIPs);
}

/**
 * Wrapper around fetch() that validates the URL before making the request.
 * Use this instead of raw fetch() when the URL may contain user input.
 *
 * AM-08: Uses redirect: "manual" and validates each Location header to
 * prevent a validated public URL from redirecting to an internal target.
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
  return safeFetchWithRedirectValidation(urlString, options, allowPrivateIPs);
}

/**
 * FIX-22 (F-022): Centralised outbound fetch with hostname allow-list.
 *
 * Prevents SSRF and supply-chain attacks by restricting outbound
 * fetch() calls to known-good hostnames. All internal and external
 * HTTP calls should use this instead of raw fetch() when the URL
 * is not hardcoded to a trusted domain.
 *
 * The allow-list is sourced from:
 *   1. OUTBOUND_ALLOWED_HOSTNAMES env var (comma-separated, production override)
 *   2. A hardcoded fallback of internal + SaaS services used by the app
 *
 * Usage:
 *   import { fetchAllowed } from "@/lib/fetch-allowed";
 *   const res = await fetchAllowed("https://api.stripe.com/v1/charges", { method: "GET" });
 */

import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/**
 * SS-01: Production-safe trusted hostnames. localhost/private defaults are
 * excluded in production to prevent SSRF if this helper is ever reused
 * with user-controlled URLs.
 */
const PRODUCTION_ALLOWED_HOSTNAMES = new Set([
  // Cloudflare APIs
  "api.cloudflare.com",
  "api.stripe.com",
  // Supabase
  "*.supabase.co",
  "*.supabase.in",
  // Resend
  "api.resend.com",
  "resend.com",
  // Search engines (sitemap ping)
  "www.google.com",
  "www.bing.com",
  // Analytics / tracking (if used)
  "api.mixpanel.com",
  "api.segment.io",
]);

/**
 * SS-01: Development-only hostnames. These are only included when
 * NODE_ENV !== "production" to prevent SSRF via localhost/private IPs.
 */
const DEV_ONLY_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Hardcoded fallback of trusted hostnames used by the application. */
const DEFAULT_ALLOWED_HOSTNAMES = new Set([
  ...PRODUCTION_ALLOWED_HOSTNAMES,
  ...(process.env.NODE_ENV === "production" ? [] : DEV_ONLY_HOSTNAMES),
]);

let cachedAllowed: Set<string> | null = null;
let cachedEnvRaw = "";

function getAllowedHostnames(): Set<string> {
  const envRaw = process.env.OUTBOUND_ALLOWED_HOSTNAMES ?? "";
  if (cachedAllowed && envRaw === cachedEnvRaw) return cachedAllowed;

  const hostnames = new Set(DEFAULT_ALLOWED_HOSTNAMES);
  for (const h of envRaw.split(",")) {
    const trimmed = h.trim().toLowerCase();
    if (trimmed) hostnames.add(trimmed);
  }
  cachedAllowed = hostnames;
  cachedEnvRaw = envRaw;
  return hostnames;
}

/** Clear the cached allow-list (for tests). */
export function __resetFetchAllowedCache(): void {
  cachedAllowed = null;
  cachedEnvRaw = "";
}

/**
 * Check if a hostname is allowed.
 * Supports exact matches and wildcard prefixes (*.example.com).
 */
function isHostnameAllowed(hostname: string, allowed: Set<string>): boolean {
  const lower = hostname.toLowerCase();
  if (allowed.has(lower)) return true;
  // Wildcard match: *.example.com matches sub.example.com
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const wildcard = "*." + parts.slice(i).join(".");
    if (allowed.has(wildcard)) return true;
  }
  return false;
}

/** Error thrown when a hostname is not on the allow-list. */
export class DisallowedHostnameError extends Error {
  constructor(public readonly hostname: string) {
    super(`Hostname "${hostname}" is not on the outbound fetch allow-list`);
    this.name = "DisallowedHostnameError";
  }
}

/**
 * Fetch wrapper that validates the hostname against an allow-list.
 *
 * @param url - The URL to fetch. Must be an absolute URL (http:// or https://).
 * @param options - Standard RequestInit options.
 * @throws DisallowedHostnameError if the hostname is not allowed.
 */
export async function fetchAllowed(url: string, options?: RequestInit): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Invalid URL: ${url}`);
  }

  const allowed = getAllowedHostnames();
  if (!isHostnameAllowed(parsed.hostname, allowed)) {
    const err = new DisallowedHostnameError(parsed.hostname);
    logger.error("Outbound fetch blocked by allow-list", {
      hostname: parsed.hostname,
      url: parsed.origin + parsed.pathname, // omit query params for privacy
    });
    captureException(err, { context: "fetch-allowed.blocked" });
    throw err;
  }

  return fetch(url, options);
}

/**
 * Fetch wrapper that validates the hostname and enforces a timeout.
 * Use this for external API calls that should not hang indefinitely.
 */
export async function fetchAllowedWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  // Combine the caller's signal (if any) with our timeout signal so that
  // either source can abort the request. Without this, a caller-provided
  // AbortSignal would be silently dropped and a fetch could continue
  // running after the parent request context was cancelled.
  const signal = options?.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  try {
    return await fetchAllowed(url, {
      ...options,
      signal,
    });
  } finally {
    clearTimeout(id);
  }
}

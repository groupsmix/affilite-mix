/**
 * FIX-05 (F-010): Merchant domain allow-list for affiliate_url writes.
 *
 * Prevents admins from inserting arbitrary URLs into the affiliate_url
 * field by restricting writes to known merchant domains. This closes the
 * open-redirect / SSRF vector where a compromised admin could point
 * affiliate links at attacker-controlled servers.
 *
 * The allow-list is sourced from:
 *   1. AFFILIATE_ALLOWED_DOMAINS env var (comma-separated, production override)
 *   2. A hardcoded fallback of common affiliate network domains
 *
 * F-16: In strict mode, the allow-list fails closed - any domain not
 * explicitly allowed is rejected. This prevents an attacker who can
 * store an affiliate URL in the DB from redirecting to unsanctioned domains.
 *
 * During the transition period, validation is "warn-only" — invalid domains
 * are logged but not rejected. Set AFFILIATE_DOMAIN_ENFORCEMENT=strict to
 * enforce rejection. This lets operators audit existing data before
 * breaking legitimate writes.
 */

import { logger } from "@/lib/logger";
import { emitMetric } from "@/lib/metrics";

/**
 * Hardcoded fallback domains for well-known affiliate networks.
 * These are always allowed regardless of env var or DB state.
 */
const DEFAULT_ALLOWED_DOMAINS = [
  // Amazon Associates
  "amazon.com",
  "amzn.to",
  "amzn.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.co.jp",
  "amazon.ca",
  "amazon.com.au",
  "amazon.in",
  "amazon.sa",
  "amazon.sg",
  "amazon.com.br",
  "amazon.com.mx",
  "amazon.es",
  "amazon.it",
  "amazon.nl",
  // CJ Affiliate / Commission Junction
  "cj.com",
  "anrdoezrs.net",
  "dpbolvw.net",
  "jdoqocy.com",
  "kqzyfj.com",
  "tkqlhce.com",
  // Impact Radius
  "impact.com",
  // ShareASale
  "shareasale.com",
  "shareasale-analytics.com",
  // Awin / Affiliate Window
  "awin1.com",
  "awin.com",
  // Rakuten / LinkShare
  "rakuten.com",
  "linksynergy.com",
  "link.synergy.net",
  // Admitad
  "admitad.com",
  "admitad.global",
  // PartnerStack
  "partnerstack.com",
  // Avangate / 2Checkout
  "avangate.com",
  // ClickBank
  "clickbank.com",
  "hop.clickbank.net",
  // eBay Partner Network
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "rover.ebay.com",
  // Booking.com
  "booking.com",
  // Walmart
  "walmart.com",
  "affil.walmart.com",
  // Target
  "target.com",
  // Crypto tax software affiliates (Crypto Tax AU)
  "koinly.io",
  "syla.com.au",
  "cryptotaxcalculator.io",
  "coinledger.io",
  "cointracking.info",
  "coinpanda.io",
  "cryptotaxau.com",
  // Etsy AI/POD tool official + affiliate destinations (compareai.site)
  "everbee.io",
  "getalura.com",
  "alura.io",
  "kittl.com",
  "canva.com",
  "partnerstack.com",
  "printful.com",
  // Watch brand official + affiliate destinations (wristnerd.xyz)
  "seikowatches.com",
  "orientwatchusa.com",
  "citizenwatch.com",
  "tissotwatches.com",
  "hamiltonwatch.com",
  "casio.com",
  "timex.com",
  "skagen.com",
  "mvmt.com",
  "fossil.com",
  "danielwellington.com",
  "bartonwatchbands.com",
  "hirschstraps.com",
  "crownandbuckle.com",
];

/**
 * Parse the AFFILIATE_ALLOWED_DOMAINS env var into a set of lowercase domains.
 */
function getEnvDomains(): Set<string> {
  const raw = process.env.AFFILIATE_ALLOWED_DOMAINS ?? "";
  const domains = new Set<string>();
  for (const d of raw.split(",")) {
    const trimmed = d.trim().toLowerCase();
    if (trimmed) domains.add(trimmed);
  }
  return domains;
}

/**
 * Cached merged set of all allowed domains.
 * Built once per isolate and refreshed when the env var changes.
 */
let cachedDomains: Set<string> | null = null;
let cachedEnvRaw = "";

function getAllowedDomains(): Set<string> {
  const envRaw = process.env.AFFILIATE_ALLOWED_DOMAINS ?? "";
  if (cachedDomains && envRaw === cachedEnvRaw) return cachedDomains;

  const domains = new Set<string>();
  for (const d of DEFAULT_ALLOWED_DOMAINS) {
    domains.add(d.toLowerCase());
  }
  for (const d of getEnvDomains()) {
    domains.add(d);
  }

  cachedDomains = domains;
  cachedEnvRaw = envRaw;
  return domains;
}

/**
 * Extract the registrable domain from a hostname.
 * e.g. "www.example.com" → "example.com"
 *      "sub.example.co.uk" → "example.co.uk"
 *
 * Uses a simple heuristic: strip the first label if there are 3+ parts
 * and the TLD is a known multi-part suffix.
 */
function extractRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length <= 2) return hostname.toLowerCase();

  // Known multi-part TLDs
  const multiPartTlds = new Set([
    "co.uk",
    "co.jp",
    "co.nz",
    "co.za",
    "co.in",
    "co.il",
    "com.au",
    "com.br",
    "com.mx",
    "com.sg",
    "com.hk",
    "com.tw",
    "com.my",
    "com.tr",
    "com.ar",
    "com.co",
    "org.uk",
    "org.au",
    "net.au",
    "net.nz",
    "ac.uk",
    "ac.nz",
    "ac.za",
    "gov.uk",
    "gov.au",
  ]);

  const lastTwo = parts.slice(-2).join(".");
  if (multiPartTlds.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

export interface DomainValidationResult {
  allowed: boolean;
  domain: string;
  reason?: string;
}

/**
 * Check if an affiliate URL's domain is on the allow-list.
 *
 * Returns `{ allowed: true }` if the domain is permitted, or
 * `{ allowed: false, reason }` if not.
 *
 * In "strict" enforcement mode (default in all environments), invalid
 * domains are rejected. In "warn" mode (explicit opt-in via
 * AFFILIATE_DOMAIN_ENFORCEMENT=warn), invalid domains are logged but
 * still allowed — use this only during a data-audit window.
 */
export function validateAffiliateDomain(url: string): DomainValidationResult {
  // S1-A1-001: default to "strict" in ALL environments so an unapproved
  // domain is always rejected. Operators can explicitly set
  // AFFILIATE_DOMAIN_ENFORCEMENT=warn during a data-audit window, but
  // "warn" must be an explicit opt-in — never the default.
  const enforcement = process.env.AFFILIATE_DOMAIN_ENFORCEMENT ?? "strict";

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return { allowed: false, domain: "", reason: "Malformed URL" };
  }

  const registrable = extractRegistrableDomain(hostname);
  const allowed = getAllowedDomains();

  // Check exact hostname, registrable domain, or subdomain of allowed domain
  const isAllowed =
    allowed.has(hostname) ||
    allowed.has(registrable) ||
    // Check if hostname is a subdomain of an explicitly allowed registrable domain
    Array.from(allowed).some((d) => !d.endsWith(".") && hostname.endsWith(`.${d}`));

  if (isAllowed) {
    return { allowed: true, domain: hostname };
  }

  const reason = `Domain "${hostname}" (registrable: "${registrable}") is not on the affiliate allow-list`;

  if (enforcement === "strict") {
    // F-16: Emit metric for strict mode rejections to monitor potential attacks
    emitMetric("affiliate_domain_rejection_total", 1, { enforcement: "strict" });
    return { allowed: false, domain: hostname, reason };
  }

  // Warn mode: log but allow
  logger.warn(`[FIX-05] Affiliate domain not on allow-list (warn mode)`, {
    hostname,
    registrable,
    enforcement,
  });
  // F-16: Emit metric for warn mode to monitor configuration drift
  emitMetric("affiliate_domain_warn_total", 1, { enforcement: "warn" });
  return { allowed: true, domain: hostname, reason };
}

/** Test helper: reset cached domains. */
export function __resetAllowedDomainsCacheForTests(): void {
  cachedDomains = null;
  cachedEnvRaw = "";
}

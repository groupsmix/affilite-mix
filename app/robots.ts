import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { allSites } from "@/config/sites";

const DEFAULT_DOMAIN = allSites[0]?.domain ?? "example.com";

/**
 * audit5-#22: hosts that are configured in `config/sites/*` and may
 * legitimately appear as a request `Host` header. Anything else
 * (unknown host, attacker-supplied Host) falls back to the configured
 * default rather than echoing the attacker-supplied value into the
 * `Sitemap:` line of robots.txt.
 */
const KNOWN_HOSTS = new Set<string>(allSites.map((s) => s.domain));

/**
 * Resolve the host to advertise in the `Sitemap:` line.
 *
 *   1. If the request Host header matches a configured site, use it
 *      verbatim — this is the multi-tenant case where the same Next.js
 *      build serves multiple domains.
 *   2. Otherwise fall back to `getCurrentSite()` (which itself defaults
 *      to NEXT_PUBLIC_DEFAULT_SITE on unknown hosts). Pre-audit-#22
 *      this was the only path — it meant an unknown-host request got
 *      the *default* site's sitemap URL even though it might have been
 *      legitimately routed to a different site (e.g. behind a custom
 *      preview alias).
 *
 * Never use the raw Host header outright — an attacker can set
 * `Host: evil.example` and get an `Sitemap: https://evil.example/…`
 * back, which Google would then attempt to fetch.
 */
async function resolveDomain(): Promise<string> {
  // Try the request host first.
  try {
    const h = await headers();
    const hostHeader = h.get("host");
    if (hostHeader) {
      // Strip the port portion (`example.com:443` → `example.com`).
      const bareHost = hostHeader.split(":")[0]?.toLowerCase();
      if (bareHost && KNOWN_HOSTS.has(bareHost)) return bareHost;
    }
  } catch {
    // fail-open: best-effort; happens in tests where headers() is unavailable. [criticality:non-critical]
  }
  // Fall back to the resolved site context.
  try {
    const { getCurrentSite } = await import("@/lib/site-context");
    const site = await getCurrentSite();
    return site.domain;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
  }
  return DEFAULT_DOMAIN;
}

/**
 * Major AI search crawlers explicitly allowed to crawl the full public site.
 * These drive Generative Engine Optimization (GEO) traffic; blocking them
 * removes the site from AI search answers.
 */
const AI_SEARCH_CRAWLERS_ALLOWED = [
  "GPTBot",
  "OAI-SearchBot",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
];

/**
 * AI-training / scraper UAs blocked site-wide (A113-F2, F-14, A9-01).
 * robots.txt is advisory — hostile bots may ignore it. The enforcing layer
 * is the Cloudflare WAF edge rules.
 */
const AI_TRAINING_AND_SCRAPER_BOTS_BLOCKED = [
  "CCBot",
  "anthropic-ai",
  "Bytespider",
  "cohere-ai",
  "FacebookBot",
  "ImagesiftBot",
  "Omgilibot",
  "Diffbot",
  "PetalBot",
  "Amazonbot",
  "YouBot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "Scrapy",
  "Timpibot",
  "VelenPublicWebCrawler",
  "ISSCyberRiskCrawler",
  "Kangaroo Bot",
  // A9-01: additional AI-training crawlers as of 2026-Q2
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "MistralAI-User",
  "pangubot",
  "iaskspider/2.0",
  "Webzio-Extended",
  "cohere-training-data-crawler",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const domain = await resolveDomain();

  return {
    rules: [
      // Allow major AI search crawlers first so they take precedence over
      // the broader training-bot block below.
      ...AI_SEARCH_CRAWLERS_ALLOWED.map((bot) => ({
        userAgent: bot,
        allow: ["/"],
      })),
      ...AI_TRAINING_AND_SCRAPER_BOTS_BLOCKED.map((bot) => ({
        userAgent: bot,
        disallow: ["/"],
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Admin UI is gated by Cloudflare Access at the edge and additionally
          // returns a non-200 status to unauthenticated clients, so it does not
          // appear here. Listing the path would publish the routed segment.
          "/api/",
          "/r/",
          "/newsletter/confirm",
          "/newsletter/unsubscribe",
          "/*?*preview=*",
        ],
      },
    ],
    sitemap: `https://${domain}/sitemap.xml`,
  };
}

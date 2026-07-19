import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/**
 * Google Search Console sitemap submission helper.
 *
 * Uses the Search Console API (webmasters/v3) PUT endpoint. Submitting a
 * sitemap requires an OAuth 2.0 access token with the
 * `https://www.googleapis.com/auth/webmasters` scope.
 *
 * If no access token is configured, submission is skipped silently so the
 * cron continues to refresh sitemaps without failing.
 *
 * Property type:
 *   - `url_prefix`: `https://example.com/` (default)
 *   - `domain`: `sc-domain:example.com`
 */
export interface SearchConsoleSubmitOptions {
  domain: string;
  propertyType?: "url_prefix" | "domain";
  accessToken?: string;
  feedpath?: string;
}

export interface SearchConsoleSubmitResult {
  ok: boolean;
  domain: string;
  siteUrl: string;
  feedpath: string;
  status: number;
  error?: string;
}

const GSC_SUBMIT_BASE = "https://www.googleapis.com/webmasters/v3/sites";

function buildSiteUrl(domain: string, propertyType: "url_prefix" | "domain"): string {
  return propertyType === "domain" ? `sc-domain:${domain}` : `https://${domain}/`;
}

export async function submitSitemap(
  options: SearchConsoleSubmitOptions,
): Promise<SearchConsoleSubmitResult> {
  const { domain, propertyType = "url_prefix" } = options;
  const accessToken = options.accessToken?.trim();
  const feedpath = options.feedpath?.trim() || `https://${domain}/sitemap.xml`;
  const siteUrl = buildSiteUrl(domain, propertyType);

  if (!accessToken) {
    return { ok: false, domain, siteUrl, feedpath, status: 0, error: "Missing access token" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const encodedFeedpath = encodeURIComponent(feedpath);
  const url = `${GSC_SUBMIT_BASE}/${encodedSiteUrl}/sitemaps/${encodedFeedpath}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.ok || response.status === 204) {
      logger.info("[search-console] Sitemap submitted", { domain, siteUrl, feedpath });
      return { ok: true, domain, siteUrl, feedpath, status: response.status };
    }

    const body = await response.text().catch(() => "");
    const error = `Search Console API returned ${response.status}: ${body.slice(0, 200)}`;
    logger.warn("[search-console] Sitemap submission rejected", {
      domain,
      siteUrl,
      feedpath,
      status: response.status,
      body: body.slice(0, 500),
    });
    return { ok: false, domain, siteUrl, feedpath, status: response.status, error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    captureException(err, { context: "[search-console] submitSitemap failed", extra: { domain } });
    return { ok: false, domain, siteUrl, feedpath, status: 0, error: msg };
  }
}

/**
 * Read the configured Search Console access token from the environment.
 */
export function getSearchConsoleAccessToken(): string | undefined {
  return process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN?.trim();
}

/**
 * Read the configured Search Console property type from the environment.
 */
export function getSearchConsolePropertyType(): "url_prefix" | "domain" {
  const value = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY_TYPE?.trim().toLowerCase();
  return value === "domain" ? "domain" : "url_prefix";
}

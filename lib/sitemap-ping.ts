import { safeFetch } from "./ssrf-guard";
import { logger } from "@/lib/logger";

/**
 * Ping search engines to notify them of sitemap updates.
 * Called after publishing content or refreshing sitemaps.
 * Fire-and-forget — failures are logged but do not block the caller.
 */
export async function pingSitemapIndexers(sitemapUrl: string): Promise<void> {
  const endpoints = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];

  await Promise.allSettled(
    endpoints.map(async (url) => {
      try {
        const res = await safeFetch(url, { method: "GET" });
        if (!res.ok) {
          logger.warn("Sitemap ping failed", { url, status: res.status });
        }
      } catch (err) {
        logger.warn("Sitemap ping error", {
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

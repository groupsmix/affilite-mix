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
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) {
          console.warn(`Sitemap ping failed for ${url}: ${res.status}`);
        }
      } catch (err) {
        console.warn(`Sitemap ping error for ${url}:`, err);
      }
    }),
  );
}

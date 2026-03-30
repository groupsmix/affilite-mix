import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";

/**
 * RSS 2.0 feed for the current site.
 * Accessible at /feed.xml — returns XML with the latest published content.
 */
export async function GET() {
  const site = await getCurrentSite();
  const baseUrl = `https://${site.domain}`;
  const content = await listPublishedContent(site.id, undefined, 50);

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const items = content
    .map((item) => {
      const link = `${baseUrl}/${item.type}/${item.slug}`;
      const pubDate = item.updated_at
        ? new Date(item.updated_at).toUTCString()
        : new Date(item.created_at).toUTCString();

      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(item.excerpt || "")}</description>
      <pubDate>${pubDate}</pubDate>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
      <category>${escapeXml(item.type)}</category>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(site.brand.description)}</description>
    <language>${site.language}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

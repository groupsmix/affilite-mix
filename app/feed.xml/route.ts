import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";

export async function GET() {
  const site = await getCurrentSite();
  const content = await listPublishedContent(site.id, undefined, 50);

  const baseUrl = `https://${site.domain}`;

  const items = content
    .map(
      (item) => `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${baseUrl}/${item.type}/${item.slug}</link>
      <guid isPermaLink="true">${baseUrl}/${item.type}/${item.slug}</guid>
      <description><![CDATA[${item.excerpt || item.title}]]></description>
      <pubDate>${new Date(item.created_at).toUTCString()}</pubDate>
      ${item.author ? `<author>${item.author}</author>` : ""}
      <category>${item.type}</category>
    </item>`,
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${site.name}</title>
    <link>${baseUrl}</link>
    <description>${site.brand.description}</description>
    <language>${site.language}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

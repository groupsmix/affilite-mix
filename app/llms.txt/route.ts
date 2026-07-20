import { headers } from "next/headers";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listPublishedPages } from "@/lib/dal/pages";
import { shouldSkipDbCall } from "@/lib/db-available";
import { getAllSyncGuideParams } from "@/lib/crypto-tax-au-tools";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const site = await getCurrentSite();
  const hostHeader = (await headers()).get("host");
  const domain = hostHeader ? hostHeader.split(":")[0] : site.domain;
  const baseUrl = `https://${domain}`;

  const lines: string[] = [
    `# ${site.name}`,
    "",
    `URL: ${baseUrl}/`,
    site.brand.description ?? "",
    "",
  ];

  if (!shouldSkipDbCall()) {
    try {
      const [content, categories, pages] = await Promise.all([
        listPublishedContent(site.id, undefined, 100),
        listCategories(site.id),
        listPublishedPages(site.id),
      ]);

      if (pages.length > 0) {
        lines.push("## Pages");
        for (const page of pages) {
          lines.push(`- ${baseUrl}/p/${page.slug}: ${page.title}`);
        }
        lines.push("");
      }

      if (categories.length > 0) {
        lines.push("## Categories");
        for (const category of categories) {
          lines.push(`- ${baseUrl}/category/${category.slug}: ${category.name}`);
        }
        lines.push("");
      }

      if (content.length > 0) {
        lines.push("## Content");
        for (const item of content) {
          lines.push(`- ${baseUrl}/${item.type}/${item.slug}: ${item.title}`);
        }
        lines.push("");
      }
    } catch (err) {
      logger.warn("[llms.txt] failed to load dynamic entries", {
        domain,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if ((site.slug ?? site.id) === "crypto-tools") {
    lines.push("## Tools");
    lines.push(`- ${baseUrl}/tools: Crypto Tax Tools`);
    lines.push(`- ${baseUrl}/tools/crypto-tax-comparison: Crypto Tax Software Comparison`);
    lines.push(`- ${baseUrl}/tools/cgt-calculator: ATO CGT Calculator`);
    for (const { exchange, software } of getAllSyncGuideParams()) {
      lines.push(
        `- ${baseUrl}/tools/sync-guide/${exchange}/${software}: ${exchange} + ${software} sync guide`,
      );
    }
    lines.push("");
  }

  return new Response(lines.join("\n").trimEnd(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

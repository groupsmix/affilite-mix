import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai/content-generator";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { allSites } from "@/config/sites";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { captureException } from "@/lib/sentry";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { AIContentType } from "@/lib/ai/content-generator";

/**
 * Cron endpoint: Auto-generate AI articles for all active sites.
 * Intended to run daily (e.g. 8am UTC).
 * Protected by CRON_SECRET header.
 *
 * Generates 3 articles per site — topics are auto-selected based on niche.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ARTICLES_PER_SITE = 3;
  const contentTypes: AIContentType[] = ["article", "review", "guide"];
  const results: { site: string; generated: number; errors: string[] }[] = [];

  for (const site of allSites) {
    const siteResult = { site: site.id, generated: 0, errors: [] as string[] };

    let dbSiteId: string;
    try {
      dbSiteId = await resolveDbSiteId(site.id);
    } catch {
      siteResult.errors.push("Could not resolve DB site ID");
      results.push(siteResult);
      continue;
    }

    for (let i = 0; i < ARTICLES_PER_SITE; i++) {
      const contentType = contentTypes[i % contentTypes.length];
      const niche = site.brand.niche;
      const topics = [
        `Top ${niche} picks this month`,
        `Best ${niche} for beginners`,
        `${niche} buying guide`,
      ];

      const topic = topics[i % topics.length];

      try {
        const result = await generateContent({
          siteId: site.id,
          siteName: site.name,
          niche: site.brand.niche,
          contentType,
          topic,
          language: site.language,
        });

        await createAIDraft({
          site_id: dbSiteId,
          title: result.title,
          slug: result.slug,
          body: result.body,
          excerpt: result.excerpt,
          content_type: result.contentType,
          topic,
          keywords: [],
          ai_provider: result.provider,
          ai_model: result.model,
          status: "pending",
          generated_at: new Date().toISOString(),
          meta_title: result.metaTitle,
          meta_description: result.metaDescription,
        });

        siteResult.generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        siteResult.errors.push(`${contentType} "${topic}": ${msg}`);
        captureException(err, {
          context: `[cron/ai-generate] Failed for ${site.id}`,
        });
      }
    }

    results.push(siteResult);
  }

  const totalGenerated = results.reduce((sum, r) => sum + r.generated, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  return NextResponse.json({
    ok: true,
    summary: `Generated ${totalGenerated} drafts across ${results.length} sites (${totalErrors} errors)`,
    results,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai/content-generator";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { allSites } from "@/config/sites";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { captureException } from "@/lib/sentry";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import type { AIContentType } from "@/lib/ai/content-generator";

/**
 * F-AI-02: Basic content moderation. Returns true if the text contains
 * patterns commonly associated with harmful or prohibited content.
 * A more robust approach would use Cloudflare Workers AI moderation or
 * OpenAI's moderation API.
 */
const PROHIBITED_PATTERNS = [
  /\b(phishing|malware|exploit|ransomware)\b/i,
  /\b(illegal.*download|crack(ed|s)?.*software)\b/i,
  /\b(hate\s*speech|incit(e|ing)\s*violence)\b/i,
];

function containsProhibitedContent(text: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Cron endpoint: Auto-generate AI articles for all active sites.
 * Intended to run daily (e.g. 8am UTC).
 * Protected by CRON_SECRET header.
 *
 * Generates 3 articles per site — topics are auto-selected based on niche.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/ai-generate"))) {
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

        // F-AI-02: Basic content moderation before creating the draft.
        // Check for obvious harmful content patterns. If flagged, set status
        // to 'flagged' so an admin must manually approve before publishing.
        const combinedText = `${result.title} ${result.excerpt} ${result.body}`;
        const flagged = containsProhibitedContent(combinedText);

        await createAIDraft(
          {
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
            status: flagged ? "rejected" : "pending",
            generated_at: new Date().toISOString(),
            meta_title: result.metaTitle,
            meta_description: result.metaDescription,
          },
          getPrivilegedSupabaseClient,
        );

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

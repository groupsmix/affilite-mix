import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai/content-generator";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { allSites } from "@/config/sites";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { cronLock } from "@/lib/cron-lock";
import type { AIContentType } from "@/lib/ai/content-generator";
import { containsProhibitedContent } from "@/lib/ai/content-moderation";

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

  // AUDIT-FIX: Prevent overlapping AI generation runs
  const lock = cronLock("ai-generate");
  const lockAcquired = await lock.acquire();
  if (!lockAcquired) {
    return NextResponse.json(
      { ok: false, error: "AI generation already in progress (locked)" },
      { status: 409 },
    );
  }

  try {
    const ARTICLES_PER_SITE = 3;
    const contentTypes: AIContentType[] = ["article", "review", "guide"];
    const results: { site: string; generated: number; errors: string[] }[] = [];

    for (const site of allSites) {
      const siteResult = { site: site.id, generated: 0, errors: [] as string[] };

      let dbSiteId: string;
      try {
        dbSiteId = await resolveDbSiteId(site.id);
      } catch {
        // fail-open: best-effort
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
          // to 'rejected' (the existing AIDraftRow type doesn't have a 'flagged'
          // status). An admin can filter rejected drafts and manually approve.
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

    void recordCronLiveness("ai-generate");
    return NextResponse.json({
      ok: true,
      summary: `Generated ${totalGenerated} drafts across ${results.length} sites (${totalErrors} errors)`,
      results,
    });
  } finally {
    // Always release the overlap lock, even if an unexpected error is thrown.
    await lock.release();
  }
}

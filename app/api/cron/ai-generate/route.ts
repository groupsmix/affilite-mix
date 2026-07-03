import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai/content-generator";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { allSites } from "@/config/sites";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { cronLock } from "@/lib/cron-lock";
import type { AIContentType } from "@/lib/ai/content-generator";
import { containsProhibitedContent } from "@/lib/ai/content-moderation";
import { supabaseBreaker } from "@/lib/supabase-circuit-breaker";
import { recordAuditEvent } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

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

    // S3-056: Resumable cursor — skip sites/articles already processed.
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    let startSite = 0;
    let startArticle = 0;
    if (cursorParam) {
      const [s, a] = cursorParam.split(":").map(Number);
      if (Number.isFinite(s) && Number.isFinite(a)) {
        startSite = s!;
        startArticle = a!;
      }
    }

    let lastCursor = `${startSite}:${startArticle}`;

    for (let si = startSite; si < allSites.length; si++) {
      const site = allSites[si];
      const siteResult = { site: site!.id, generated: 0, errors: [] as string[] };

      let dbSiteId: string;
      try {
        dbSiteId = await resolveDbSiteId(site!.id);
      } catch {
        siteResult.errors.push("Could not resolve DB site ID");
        results.push(siteResult);
        continue;
      }

      const articleStart = si === startSite ? startArticle : 0;
      for (let i = articleStart; i < ARTICLES_PER_SITE; i++) {
        const contentType = contentTypes[i % contentTypes.length];
        const niche = site!.brand.niche;
        const topics = [
          `Top ${niche} picks this month`,
          `Best ${niche} for beginners`,
          `${niche} buying guide`,
        ];

        const topic = topics[i % topics.length];

        try {
          const result = await generateContent({
            siteId: site!.id,
            siteName: site!.name,
            niche: site!.brand.niche,
            contentType: contentType!,
            topic: topic!,
            language: site!.language,
          });

          // F-AI-02: Basic content moderation before creating the draft.
          // S5-02: Include metaTitle/metaDescription in the scan.
          const combinedText = `${result.title} ${result.excerpt} ${result.metaTitle} ${result.metaDescription} ${result.body}`;
          const flagged = containsProhibitedContent(combinedText);

          await supabaseBreaker.execute(() =>
            createAIDraft(
              {
                site_id: dbSiteId,
                title: result.title,
                slug: result.slug,
                body: result.body,
                excerpt: result.excerpt,
                content_type: result.contentType,
                topic: topic!,
                keywords: [],
                ai_provider: result.provider,
                ai_model: result.model,
                status: flagged ? "rejected" : "pending",
                generated_at: new Date().toISOString(),
                meta_title: result.metaTitle,
                meta_description: result.metaDescription,
              },
              getPrivilegedSupabaseClient,
            ),
          );

          siteResult.generated++;

          // E2-005: Audit trail for AI-generated content requiring human review.
          void recordAuditEvent({
            site_id: dbSiteId,
            actor: "cron:ai-generate",
            action: flagged ? "ai_draft_rejected" : "ai_draft_pending_review",
            entity_type: "ai_draft",
            entity_id: result.slug,
            details: {
              title: result.title,
              contentType: result.contentType,
              provider: result.provider,
              model: result.model,
              flagged,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          siteResult.errors.push(`${contentType} "${topic}": ${msg}`);
          captureException(err, {
            context: `[cron/ai-generate] Failed for ${site!.id}`,
          });
        }
        // S3-056: Update checkpoint after each article attempt.
        lastCursor = `${si}:${i + 1}`;
      }

      results.push(siteResult);
    }

    const totalGenerated = results.reduce((sum, r) => sum + r.generated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    // E2-005: Log summary so operators see pending review count in structured logs.
    if (totalGenerated > 0) {
      logger.info("[cron/ai-generate] Drafts created — require human review before publishing", {
        totalGenerated,
        totalErrors,
        sites: results.length,
      });
    }

    void recordCronLiveness("ai-generate");
    return NextResponse.json({
      ok: true,
      cursor: lastCursor,
      summary: `Generated ${totalGenerated} drafts across ${results.length} sites (${totalErrors} errors)`,
      results,
    });
  } finally {
    // Always release the overlap lock, even if an unexpected error is thrown.
    await lock.release();
  }
}

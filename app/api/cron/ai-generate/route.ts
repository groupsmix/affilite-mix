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
import { getPolicyForAction, type AutomationPolicyRow } from "@/lib/dal/automation-policies";
import { getCategoryById } from "@/lib/dal/categories";
import { publishDraft } from "@/lib/automation/publish-draft";

const VALID_AI_CONTENT_TYPES: AIContentType[] = ["article", "review", "comparison", "guide"];
const DEFAULT_TOPICS = [
  (niche: string) => `Top ${niche} picks this month`,
  (niche: string) => `Best ${niche} for beginners`,
  (niche: string) => `${niche} buying guide`,
];

interface SiteSchedule {
  maxPerDay: number;
  contentType: AIContentType;
  categoryId: string | null;
  autoApprove: boolean;
  frequency: "daily" | "weekly" | "monthly";
  isActive: boolean;
}

function isAIContentType(value: unknown): value is AIContentType {
  return typeof value === "string" && (VALID_AI_CONTENT_TYPES as string[]).includes(value);
}

function resolveSchedule(
  policy: AutomationPolicyRow | null,
  fallbackNiche: string,
): SiteSchedule | null {
  if (!policy) {
    return {
      maxPerDay: 3,
      contentType: "article",
      categoryId: null,
      autoApprove: false,
      frequency: "daily",
      isActive: true,
    };
  }

  if (!policy.is_active || policy.mode === "deny") return null;

  const c = (policy.constraints ?? {}) as Record<string, unknown>;
  const rawMax =
    typeof c.max_per_day === "number" && Number.isFinite(c.max_per_day) ? c.max_per_day : 3;
  const contentType = isAIContentType(c.content_type) ? c.content_type : "article";
  const categoryId = typeof c.category_id === "string" ? c.category_id : null;
  const frequency = ["daily", "weekly", "monthly"].includes(c.frequency as string)
    ? (c.frequency as "daily" | "weekly" | "monthly")
    : "daily";

  return {
    maxPerDay: Math.max(1, Math.min(100, rawMax)),
    contentType,
    categoryId,
    autoApprove: policy.mode === "allow",
    frequency,
    isActive: policy.is_active,
  };
}

function shouldRunForFrequency(frequency: "daily" | "weekly" | "monthly"): boolean {
  const now = new Date();
  if (frequency === "daily") return true;
  if (frequency === "weekly") return now.getUTCDay() === 1; // Monday
  if (frequency === "monthly") return now.getUTCDate() === 1;
  return true;
}

/**
 * Cron endpoint: Auto-generate AI articles for all active sites.
 * Intended to run daily (e.g. 2am UTC).
 * Protected by CRON_SECRET header.
 *
 * Reads per-site automation policy (action_type = content.draft.create) to
 * decide how many articles to generate, which content type and category to
 * target, and whether to auto-publish drafts that pass moderation.
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
    const results: {
      site: string;
      generated: number;
      published: number;
      rejected: number;
      errors: string[];
    }[] = [];

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
      const siteResult = {
        site: site!.id,
        generated: 0,
        published: 0,
        rejected: 0,
        errors: [] as string[],
      };

      let dbSiteId: string;
      try {
        dbSiteId = await resolveDbSiteId(site!.id);
      } catch {
        siteResult.errors.push("Could not resolve DB site ID");
        results.push(siteResult);
        continue;
      }

      let schedule: SiteSchedule;
      try {
        const policy = await getPolicyForAction(dbSiteId, "content.draft.create");
        const resolved = resolveSchedule(policy, site!.brand.niche);
        if (!resolved || !shouldRunForFrequency(resolved.frequency)) {
          results.push({ ...siteResult, generated: 0 });
          continue;
        }
        schedule = resolved;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        siteResult.errors.push(`Could not read automation policy: ${msg}`);
        results.push(siteResult);
        continue;
      }

      const articleStart = si === startSite ? startArticle : 0;
      for (let i = articleStart; i < schedule.maxPerDay; i++) {
        const niche = site!.brand.niche;
        let topic = DEFAULT_TOPICS[i % DEFAULT_TOPICS.length]?.(niche) ?? `Latest ${niche} update`;

        if (schedule.categoryId) {
          try {
            const category = await getCategoryById(
              dbSiteId,
              schedule.categoryId,
              getPrivilegedSupabaseClient,
            );
            if (category?.name) topic = category.name;
          } catch {
            // Fallback to default topic if category cannot be read.
          }
        }

        try {
          const result = await generateContent({
            siteId: site!.id,
            siteName: site!.name,
            niche: site!.brand.niche,
            contentType: schedule.contentType,
            topic,
            language: site!.language,
          });

          // F-AI-02: Basic content moderation before creating the draft.
          // S5-02: Include metaTitle/metaDescription in the scan.
          const combinedText = `${result.title} ${result.excerpt} ${result.metaTitle} ${result.metaDescription} ${result.body}`;
          const flagged = containsProhibitedContent(combinedText);

          const draft = await supabaseBreaker.execute(() =>
            createAIDraft(
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
            ),
          );

          siteResult.generated++;

          if (!flagged && schedule.autoApprove) {
            try {
              await publishDraft(dbSiteId, draft.id, "auto-approve");
              siteResult.published++;
            } catch (publishErr) {
              const msg = publishErr instanceof Error ? publishErr.message : String(publishErr);
              siteResult.errors.push(`Publish failed for "${result.title}": ${msg}`);
              captureException(publishErr, {
                context: `[cron/ai-generate] Auto-publish failed for ${site!.id}`,
              });
            }
          }

          if (flagged) siteResult.rejected++;

          // E2-005: Audit trail for AI-generated content.
          void recordAuditEvent({
            site_id: dbSiteId,
            actor: "cron:ai-generate",
            action: flagged
              ? "ai_draft_rejected"
              : schedule.autoApprove
                ? "ai_draft_auto_published"
                : "ai_draft_pending_review",
            entity_type: "ai_draft",
            entity_id: result.slug,
            details: {
              title: result.title,
              contentType: result.contentType,
              provider: result.provider,
              model: result.model,
              flagged,
              autoApproved: !flagged && schedule.autoApprove,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          siteResult.errors.push(`${schedule.contentType} "${topic}": ${msg}`);
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
    const totalPublished = results.reduce((sum, r) => sum + r.published, 0);
    const totalRejected = results.reduce((sum, r) => sum + r.rejected, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    // E2-005: Log summary so operators see pending review count in structured logs.
    if (totalGenerated > 0) {
      logger.info("[cron/ai-generate] Drafts processed", {
        totalGenerated,
        totalPublished,
        totalRejected,
        totalErrors,
        sites: results.length,
      });
    }

    void recordCronLiveness("ai-generate");
    return NextResponse.json({
      ok: true,
      cursor: lastCursor,
      summary: `Generated ${totalGenerated} drafts across ${results.length} sites (${totalErrors} errors), ${totalPublished} auto-published, ${totalRejected} rejected`,
      results,
    });
  } finally {
    // Always release the overlap lock, even if an unexpected error is thrown.
    await lock.release();
  }
}

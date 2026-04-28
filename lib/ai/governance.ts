/**
 * F-010: AI Content Governance
 *
 * Provides quotas, provenance tracking, cost controls, and review workflow
 * for AI-generated content.
 */

import { getTenantClient } from "@/lib/supabase-server";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { captureException } from "@/lib/sentry";

/** AI Generation quota limits per site per day */
const DEFAULT_DAILY_QUOTA = 10;
const MAX_DAILY_QUOTA = 100;

export interface AIGovernanceConfig {
  siteId: string;
  dailyQuota: number;
  requireApproval: boolean;
  allowedContentTypes: string[];
  maxTokensPerRequest: number;
}

export interface AIUsageRecord {
  siteId: string;
  adminUserId: string;
  contentType: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;
  createdAt: string;
}

/**
 * F-010: Check if site has exceeded daily AI generation quota.
 */
export async function checkAIGenerationQuota(
  siteId: string,
  adminUserId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const sb = getPrivilegedSupabaseClient();

  // Get current day's usage
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { count, error } = await sb
    .from("ai_generation_usage")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString());

  if (error) {
    captureException(error, { context: "[ai/governance] check quota failed" });
    // Fail closed - deny generation if we can't check quota
    return { allowed: false, remaining: 0, resetAt: tomorrow };
  }

  const usage = count ?? 0;

  // Get site-specific quota (or default)
  const { data: configData } = await sb
    .from("site_feature_flags")
    .select("config")
    .eq("site_id", siteId)
    .eq("flag_key", "ai_quota")
    .single();

  const quota =
    (configData?.config as { daily_quota?: number })?.daily_quota ?? DEFAULT_DAILY_QUOTA;

  return {
    allowed: usage < quota,
    remaining: Math.max(0, quota - usage),
    resetAt: tomorrow,
  };
}

/**
 * F-010: Record AI generation usage for quota tracking.
 */
export async function recordAIGenerationUsage(
  siteId: string,
  adminUserId: string,
  contentType: string,
  provider: string,
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): Promise<void> {
  const sb = getPrivilegedSupabaseClient();

  // Estimate cost (rough approximation)
  const estimatedCost = estimateGenerationCost(provider, model, promptTokens, completionTokens);

  const { error } = await sb.from("ai_generation_usage").insert({
    site_id: siteId,
    admin_user_id: adminUserId,
    content_type: contentType,
    provider,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost: estimatedCost,
  });

  if (error) {
    captureException(error, { context: "[ai/governance] record usage failed" });
  }
}

/**
 * F-010: Estimate cost of AI generation based on tokens.
 */
function estimateGenerationCost(
  provider: string,
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): number {
  // Rough cost estimates per 1K tokens (as of 2026-01)
  const rates: Record<string, { input: number; output: number }> = {
    openai: { input: 0.0015, output: 0.002 },
    anthropic: { input: 0.008, output: 0.024 },
    google: { input: 0.0005, output: 0.0015 },
    default: { input: 0.001, output: 0.002 },
  };

  const rate = rates[provider] ?? rates.default;
  const prompt = promptTokens ?? 2000; // ~2000 tokens typical prompt
  const completion = completionTokens ?? 1500; // ~1500 tokens typical completion

  return (prompt / 1000) * rate.input + (completion / 1000) * rate.output;
}

/**
 * F-010: Compute hash of prompt for provenance tracking.
 */
export function computePromptHash(prompt: string): string {
  // Simple hash for tracking - in production use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * F-010: Enrich AI draft with governance metadata.
 */
export function enrichWithGovernance(
  draftData: Record<string, unknown>,
  governance: {
    provider: string;
    model: string;
    promptHash: string;
    promptPreview: string;
    estimatedCost: number;
    adminUserId: string;
  },
): Record<string, unknown> {
  return {
    ...draftData,
    // Provenance
    ai_provider: governance.provider,
    ai_model: governance.model,
    prompt_hash: governance.promptHash,
    prompt_preview: governance.promptPreview.substring(0, 200), // First 200 chars

    // Governance
    generated_by: governance.adminUserId,
    estimated_cost_usd: governance.estimatedCost,
    review_status: "pending",
    review_reason: "ai_generated_requires_review",

    // Quota tracking
    quota_consumed: true,
  };
}

/**
 * F-010: Get AI usage summary for a site (for dashboards).
 */
export async function getAIUsageSummary(
  siteId: string,
  days: number = 30,
): Promise<{
  totalGenerations: number;
  totalEstimatedCost: number;
  byContentType: Record<string, number>;
  byModel: Record<string, number>;
  dailyTrend: Array<{ date: string; count: number; cost: number }>;
}> {
  const sb = getPrivilegedSupabaseClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from("ai_generation_usage")
    .select("content_type, model, created_at, estimated_cost")
    .eq("site_id", siteId)
    .gte("created_at", since.toISOString());

  if (error) {
    captureException(error, { context: "[ai/governance] get usage summary failed" });
    return {
      totalGenerations: 0,
      totalEstimatedCost: 0,
      byContentType: {},
      byModel: {},
      dailyTrend: [],
    };
  }

  const rows = (data ?? []) as Array<{
    content_type: string;
    model: string;
    created_at: string;
    estimated_cost: number;
  }>;

  // Aggregate stats
  const byContentType: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const dailyMap: Record<string, { count: number; cost: number }> = {};

  let totalCost = 0;

  for (const row of rows) {
    byContentType[row.content_type] = (byContentType[row.content_type] ?? 0) + 1;
    byModel[row.model] = (byModel[row.model] ?? 0) + 1;

    const date = row.created_at.split("T")[0];
    if (!dailyMap[date]) {
      dailyMap[date] = { count: 0, cost: 0 };
    }
    dailyMap[date].count++;
    dailyMap[date].cost += row.estimated_cost ?? 0;
    totalCost += row.estimated_cost ?? 0;
  }

  const dailyTrend = Object.entries(dailyMap)
    .map(([date, stats]) => ({ date, count: stats.count, cost: stats.cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalGenerations: rows.length,
    totalEstimatedCost: totalCost,
    byContentType,
    byModel,
    dailyTrend,
  };
}

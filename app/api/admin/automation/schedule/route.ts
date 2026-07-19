import { NextRequest, NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { parseJsonBody } from "@/lib/api-error";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { listCategories } from "@/lib/dal/categories";
import {
  getPolicyForAction,
  upsertAutomationPolicy,
  type AutomationPolicyRow,
} from "@/lib/dal/automation-policies";
import type { AIContentType } from "@/lib/ai/content-generator";
import type { PolicyMode } from "@/lib/automation/policy";

const ACTION_TYPE = "content.draft.create";

const VALID_CONTENT_TYPES: (AIContentType | "blog")[] = [
  "article",
  "review",
  "comparison",
  "guide",
];
const VALID_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

function isValidContentType(value: unknown): value is AIContentType | "blog" {
  return typeof value === "string" && (VALID_CONTENT_TYPES as string[]).includes(value);
}

function isValidFrequency(value: unknown): value is (typeof VALID_FREQUENCIES)[number] {
  return typeof value === "string" && (VALID_FREQUENCIES as readonly string[]).includes(value);
}

export interface AutomationSchedulePayload {
  site_id: string;
  category_id: string | null;
  content_type: AIContentType | "blog";
  frequency: (typeof VALID_FREQUENCIES)[number];
  max_per_day: number;
  auto_approve: boolean;
  is_active: boolean;
}

function policyToPayload(policy: AutomationPolicyRow | null): AutomationSchedulePayload | null {
  if (!policy) return null;
  const c = (policy.constraints ?? {}) as Record<string, unknown>;
  return {
    site_id: policy.site_id,
    category_id: typeof c.category_id === "string" ? c.category_id : null,
    content_type: isValidContentType(c.content_type) ? c.content_type : "article",
    frequency: isValidFrequency(c.frequency) ? c.frequency : "daily",
    max_per_day:
      typeof c.max_per_day === "number" && Number.isFinite(c.max_per_day) ? c.max_per_day : 1,
    auto_approve: policy.mode === "allow",
    is_active: policy.is_active,
  };
}

/**
 * GET /api/admin/automation/schedule
 * Return the active site's content-generation schedule (categories + policy).
 */
export const GET = withAuthz(
  "scheduling",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("automation-schedule", session);
    if (rlResponse) return rlResponse;

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const [categories, policy] = await Promise.all([
        listCategories(siteId, {}, getClient),
        getPolicyForAction(siteId, ACTION_TYPE),
      ]);

      return NextResponse.json({
        categories,
        schedule: policyToPayload(policy),
        action_type: ACTION_TYPE,
      });
    } catch (err) {
      captureException(err, { context: "[api/admin/automation/schedule] GET failed" });
      return NextResponse.json({ error: "Failed to load automation schedule" }, { status: 500 });
    }
  },
);

/**
 * POST /api/admin/automation/schedule
 * Save or update the active site's content-generation schedule.
 */
export const POST = withAuthz(
  "scheduling",
  "configure",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("automation-schedule", session);
    if (rlResponse) return rlResponse;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError as Partial<AutomationSchedulePayload>;

    const errors: Record<string, string> = {};
    if (!isValidContentType(body.content_type)) errors.content_type = "Invalid content type";
    if (!isValidFrequency(body.frequency)) errors.frequency = "Invalid frequency";
    if (typeof body.max_per_day !== "number" || body.max_per_day < 1 || body.max_per_day > 100) {
      errors.max_per_day = "Max per day must be between 1 and 100";
    }
    if (typeof body.auto_approve !== "boolean")
      errors.auto_approve = "Auto-approve must be a boolean";
    if (typeof body.is_active !== "boolean") errors.is_active = "Active must be a boolean";
    if (
      body.category_id !== null &&
      body.category_id !== undefined &&
      typeof body.category_id !== "string"
    ) {
      errors.category_id = "Category ID must be a string or null";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
    }

    // Narrow the partial body to the validated payload after all checks pass.
    const payload = body as AutomationSchedulePayload;
    const mode: PolicyMode = payload.auto_approve ? "allow" : "approval_required";
    const constraints: Record<string, unknown> = {
      category_id: payload.category_id ?? null,
      content_type: payload.content_type,
      frequency: payload.frequency,
      max_per_day: payload.max_per_day,
      auto_approve: payload.auto_approve,
    };

    try {
      const policy = await upsertAutomationPolicy({
        site_id: siteId,
        action_type: ACTION_TYPE,
        mode,
        constraints,
        is_active: payload.is_active,
        updated_by: session.userId ?? session.email ?? "admin",
      });

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "automation.schedule.update",
        entity_type: "automation_policy",
        entity_id: policy.id,
        details: { mode, constraints, is_active: payload.is_active },
      });

      return NextResponse.json({ schedule: policyToPayload(policy) });
    } catch (err) {
      captureException(err, { context: "[api/admin/automation/schedule] POST failed" });
      return NextResponse.json({ error: "Failed to save automation schedule" }, { status: 500 });
    }
  },
);

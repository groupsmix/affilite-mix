import { NextRequest, NextResponse } from "next/server";
import {
  listScheduledJobs,
  createScheduledJob,
  cancelScheduledJob,
  type ScheduledJobRow,
} from "@/lib/dal/scheduled-jobs";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

const JOB_TYPES = new Set([
  "publish_content",
  "activate_product",
  "archive_content",
  "archive_product",
  "custom",
]);

/**
 * GET /api/admin/schedule — List scheduled jobs for the active site.
 */
export const GET = withAuthz(
  "scheduling",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("schedule", session);
    if (rlResponse) return rlResponse;

    const status = request.nextUrl.searchParams.get("status") as
      | "pending"
      | "executed"
      | "failed"
      | "cancelled"
      | null;
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "50"), 1),
      200,
    );

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const jobs = await listScheduledJobs(siteId, status ?? undefined, limit, getClient);
      return NextResponse.json({ jobs });
    } catch (err) {
      captureException(err, { context: "[api/admin/schedule] GET failed:" });
      return NextResponse.json({ error: "Failed to list scheduled jobs" }, { status: 500 });
    }
  },
);

/**
 * POST /api/admin/schedule — Create a new scheduled job.
 */
export const POST = withAuthz(
  "scheduling",
  "create",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("schedule", session);
    if (rlResponse) return rlResponse;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;
    const errors: Record<string, string> = {};

    if (typeof body.job_type !== "string" || !JOB_TYPES.has(body.job_type as string)) {
      errors.job_type = `job_type must be one of: ${[...JOB_TYPES].join(", ")}`;
    }
    if (typeof body.target_id !== "string" || body.target_id.length === 0) {
      errors.target_id = "target_id is required";
    }
    if (typeof body.scheduled_for !== "string" || body.scheduled_for.length === 0) {
      errors.scheduled_for = "scheduled_for is required (ISO 8601 datetime)";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const job = await createScheduledJob(
        {
          site_id: siteId,
          job_type: body.job_type as ScheduledJobRow["job_type"],
          target_id: body.target_id as string,
          scheduled_for: body.scheduled_for as string,
          payload:
            typeof body.payload === "object" && body.payload !== null
              ? (body.payload as Record<string, unknown>)
              : {},
        },
        getClient,
      );

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "scheduled_job",
        entity_id: job.id,
        details: {
          job_type: body.job_type as string,
          target_id: body.target_id as string,
          scheduled_for: body.scheduled_for as string,
        },
      });
      return NextResponse.json({ job }, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/schedule] POST create failed:" });
      return NextResponse.json({ error: "Failed to create scheduled job" }, { status: 500 });
    }
  },
);

/**
 * DELETE /api/admin/schedule — Cancel a pending scheduled job.
 */
export const DELETE = withAuthz(
  "scheduling",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("schedule", session);
    if (rlResponse) return rlResponse;

    const delBodyOrError = await parseJsonBody(request);
    if (delBodyOrError instanceof NextResponse) return delBodyOrError;
    if (typeof delBodyOrError.id !== "string" || (delBodyOrError.id as string).length === 0) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      await cancelScheduledJob(siteId, delBodyOrError.id as string, getClient);
      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "cancel",
        entity_type: "scheduled_job",
        entity_id: delBodyOrError.id as string,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/schedule] DELETE cancel failed:" });
      return NextResponse.json({ error: "Failed to cancel scheduled job" }, { status: 500 });
    }
  },
);

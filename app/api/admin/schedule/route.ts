import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listScheduledJobs,
  createScheduledJob,
  cancelScheduledJob,
} from "@/lib/dal/scheduled-jobs";
import { recordAuditEvent } from "@/lib/audit-log";

const JOB_TYPES = new Set([
  "publish_content",
  "activate_product",
  "archive_content",
  "archive_product",
  "custom",
]);

/**
 * GET /api/admin/schedule — List scheduled jobs for the active site.
 * Query params:
 *   ?status=pending  — filter by status (optional)
 *   ?limit=50        — max results (optional, default 50)
 */
export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

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

  const jobs = await listScheduledJobs(dbSiteId, status ?? undefined, limit);
  return NextResponse.json({ jobs });
}

/**
 * POST /api/admin/schedule — Create a new scheduled job.
 * Body: { job_type, target_id, scheduled_for, payload? }
 */
export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const errors: Record<string, string> = {};

  if (typeof body.job_type !== "string" || !JOB_TYPES.has(body.job_type)) {
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

  const job = await createScheduledJob({
    site_id: dbSiteId,
    job_type: body.job_type,
    target_id: body.target_id,
    scheduled_for: body.scheduled_for,
    payload: typeof body.payload === "object" && body.payload !== null ? body.payload : {},
  });

  recordAuditEvent({
    site_id: dbSiteId,
    actor: "admin",
    action: "create",
    entity_type: "scheduled_job",
    entity_id: job.id,
    details: { job_type: body.job_type, target_id: body.target_id, scheduled_for: body.scheduled_for },
  });
  return NextResponse.json({ job }, { status: 201 });
}

/**
 * DELETE /api/admin/schedule — Cancel a pending scheduled job.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }

  await cancelScheduledJob(dbSiteId, body.id);
  recordAuditEvent({
    site_id: dbSiteId,
    actor: "admin",
    action: "cancel",
    entity_type: "scheduled_job",
    entity_id: body.id,
  });
  return NextResponse.json({ ok: true });
}

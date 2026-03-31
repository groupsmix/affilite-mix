import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

const TABLE = "scheduled_jobs";

export interface ScheduledJobRow {
  id: string;
  site_id: string;
  job_type: "publish_content" | "activate_product" | "archive_content" | "archive_product" | "custom";
  target_id: string;
  scheduled_for: string;
  status: "pending" | "executed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  executed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface CreateScheduledJobInput {
  site_id: string;
  job_type: ScheduledJobRow["job_type"];
  target_id: string;
  scheduled_for: string;
  payload?: Record<string, unknown>;
}

/** List scheduled jobs for a site */
export async function listScheduledJobs(
  siteId: string,
  status?: ScheduledJobRow["status"],
  limit = 50,
): Promise<ScheduledJobRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ScheduledJobRow>(data);
}

/** Create a scheduled job */
export async function createScheduledJob(
  input: CreateScheduledJobInput,
): Promise<ScheduledJobRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      site_id: input.site_id,
      job_type: input.job_type,
      target_id: input.target_id,
      scheduled_for: input.scheduled_for,
      payload: input.payload ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return assertRow<ScheduledJobRow>(data, "ScheduledJob");
}

/** Cancel a scheduled job */
export async function cancelScheduledJob(
  siteId: string,
  jobId: string,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from(TABLE)
    .update({ status: "cancelled" })
    .eq("site_id", siteId)
    .eq("id", jobId)
    .eq("status", "pending");

  if (error) throw error;
}

/** Get a scheduled job by id */
export async function getScheduledJobById(
  siteId: string,
  jobId: string,
): Promise<ScheduledJobRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", jobId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ScheduledJobRow>(data);
}

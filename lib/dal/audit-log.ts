import { getServiceClient } from "@/lib/supabase-server";

export interface AuditLogEntry {
  id: string;
  site_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string;
  created_at: string;
}

export async function listAuditLogs(
  siteId: string,
  limit = 50,
  offset = 0,
): Promise<AuditLogEntry[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}

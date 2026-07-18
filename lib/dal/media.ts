import type { MediaRow } from "@/types/database";
import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { clampPagination } from "./pagination-guard";

const TABLE = "media";

const LIST_COLUMNS =
  "id, site_id, public_key, url, filename, content_type, size_bytes, alt_text, created_by, created_at, updated_at" as const;

export interface ListMediaOptions {
  siteId: string;
  limit?: number;
  offset?: number;
}

export async function listMedia(
  opts: ListMediaOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MediaRow[]> {
  const { limit, offset } = clampPagination({ limit: opts.limit ?? 50, offset: opts.offset ?? 0 });
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return assertRows<MediaRow>(data);
}

export interface CreateMediaInput {
  site_id: string;
  public_key: string;
  url: string;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  alt_text?: string | null;
  created_by?: string | null;
}

export async function createMedia(
  input: CreateMediaInput,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MediaRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<MediaRow>(data, "Media");
}

export async function deleteMedia(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id).eq("site_id", siteId);
  if (error) throw error;
}

export async function getMediaById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<MediaRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("id", id)
    .eq("site_id", siteId)
    .single();
  if (error) return null;
  return assertRow<MediaRow>(data, "Media");
}

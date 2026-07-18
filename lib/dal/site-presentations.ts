// DESIGN: site-scoped by explicit .eq("site_id", ...) on every query.
//
// The `site_presentations` table holds DB-authoritative header/footer design
// for a site (see migration 2026071506). Public rendering reads only the
// published row via the anon client (RLS: anon may read status='published');
// all draft/history reads and every write go through the privileged client
// after the route layer has authenticated an admin session.
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getAnonClient } from "@/lib/supabase-server";
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { shouldSkipDbCall } from "@/lib/db-available";
import { presentationTag } from "@/lib/cache-tags";
import type { SitePresentationRow } from "@/types/database";
import type { HeaderConfig, FooterConfig, HeaderTokens } from "@/config/presentation";
import type { PresentationSource } from "@/lib/presentation/resolve";
import { untypedFrom, untypedRpc, assertRows, rowOrNull, assertRow } from "./type-guards";
import type { DalClientGetter } from "./dal-client";

/**
 * Privileged getter for the DB-authoritative presentation table. The
 * `site_presentations` table is service_role-only for writes and draft/history
 * reads (RLS in migration 2026071506); admin session gating happens at the
 * route layer before these helpers are reached. Public rendering never uses
 * this getter — it reads the published row via the anon client below. This
 * module is the single sanctioned service-role importer for presentations,
 * mirroring lib/automation/db.ts.
 */
const getPresentationDbClient: DalClientGetter = () =>
  getPrivilegedSupabaseClient("site-presentations");

const TABLE = "site_presentations";
const COLUMNS =
  "id, site_id, status, version, header_variant, footer_variant, header_config, footer_config, header_tokens, created_by, published_by, created_at, updated_at, published_at" as const;

/** Map a DB row to the untrusted presentation source consumed by resolvePresentation. */
export function rowToPresentationSource(row: SitePresentationRow): PresentationSource {
  return {
    headerVariant: row.header_variant,
    footerVariant: row.footer_variant,
    layoutVariant: null,
    headerConfig: row.header_config,
    footerConfig: row.footer_config,
    headerTokens: row.header_tokens,
  };
}

/** Fields the dashboard/automation API may persist to a draft. */
export interface PresentationDraftInput {
  headerVariant?: string | null;
  footerVariant?: string | null;
  headerConfig: HeaderConfig;
  footerConfig: FooterConfig;
  headerTokens: HeaderTokens;
}

/* ------------------------------------------------------------------ */
/*  Public (anon) read — the live presentation                         */
/* ------------------------------------------------------------------ */

async function readPublishedRow(siteId: string): Promise<SitePresentationRow | null> {
  if (shouldSkipDbCall()) return null;
  const sb = getAnonClient() as unknown as SupabaseClient<Database>;
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "published")
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SitePresentationRow>(data);
}

// Per-site cached wrapper so publishing one site never invalidates another.
// The tag `presentation:<siteId>` is busted by publish/rollback below.
const cachedBySite = new Map<string, (siteId: string) => Promise<SitePresentationRow | null>>();

function getCachedPublishedReader(siteId: string) {
  let reader = cachedBySite.get(siteId);
  if (!reader) {
    reader = unstable_cache(readPublishedRow, ["site-presentation-published", siteId], {
      revalidate: 30,
      tags: [presentationTag(siteId)],
    });
    cachedBySite.set(siteId, reader);
  }
  return reader;
}

/**
 * Resolve the live presentation source for a site (cached, tagged by site).
 * Returns null when the site has no published presentation — callers then
 * fall back to code/config defaults.
 */
export async function getPublishedPresentationSource(
  siteId: string,
): Promise<PresentationSource | null> {
  const row = await getCachedPublishedReader(siteId)(siteId);
  return row ? rowToPresentationSource(row) : null;
}

/* ------------------------------------------------------------------ */
/*  Admin (privileged) reads — draft + history                         */
/* ------------------------------------------------------------------ */

async function readByStatus(
  siteId: string,
  status: SitePresentationRow["status"],
  getClient: DalClientGetter,
): Promise<SitePresentationRow | null> {
  const sb = (await getClient()) as unknown as SupabaseClient<Database>;
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(COLUMNS)
    .eq("site_id", siteId)
    .eq("status", status)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SitePresentationRow>(data);
}

export function getDraftPresentation(
  siteId: string,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow | null> {
  return readByStatus(siteId, "draft", getClient);
}

export function getPublishedPresentation(
  siteId: string,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow | null> {
  return readByStatus(siteId, "published", getClient);
}

/** Archived versions (most recent first) — used for the rollback affordance. */
export async function listArchivedPresentations(
  siteId: string,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow[]> {
  const sb = (await getClient()) as unknown as SupabaseClient<Database>;
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "archived")
    .order("version", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return assertRows<SitePresentationRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Writes (privileged)                                                */
/* ------------------------------------------------------------------ */

/**
 * Create or update the single draft row for a site (one draft per site,
 * enforced by a partial unique index). Values must already be validated by
 * the caller (lib/presentation) before persistence.
 */
export async function upsertDraftPresentation(
  siteId: string,
  input: PresentationDraftInput,
  actor: string | null,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow> {
  const sb = (await getClient()) as unknown as SupabaseClient<Database>;
  const existing = await getDraftPresentation(siteId, getClient);

  const payload = {
    site_id: siteId,
    status: "draft" as const,
    header_variant: input.headerVariant ?? null,
    footer_variant: input.footerVariant ?? null,
    header_config: input.headerConfig,
    footer_config: input.footerConfig,
    header_tokens: input.headerTokens,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await untypedFrom(sb, TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return assertRow<SitePresentationRow>(data, "SitePresentation");
  }

  const { data, error } = await untypedFrom(sb, TABLE)
    .insert({ ...payload, created_by: actor })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return assertRow<SitePresentationRow>(data, "SitePresentation");
}

/** Atomically publish the current draft (RPC). Returns the new live row. */
export async function publishPresentation(
  siteId: string,
  actor: string | null,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow> {
  const sb = (await getClient()) as unknown as SupabaseClient<Database>;
  const { data, error } = await untypedRpc(sb, "publish_site_presentation", {
    p_site_id: siteId,
    p_actor: actor,
  });
  if (error) throw error;
  return assertRow<SitePresentationRow>(data, "SitePresentation");
}

/** Atomically roll back to the most recent archived version (RPC). */
export async function rollbackPresentation(
  siteId: string,
  actor: string | null,
  getClient: DalClientGetter = getPresentationDbClient,
): Promise<SitePresentationRow> {
  const sb = (await getClient()) as unknown as SupabaseClient<Database>;
  const { data, error } = await untypedRpc(sb, "rollback_site_presentation", {
    p_site_id: siteId,
    p_actor: actor,
  });
  if (error) throw error;
  return assertRow<SitePresentationRow>(data, "SitePresentation");
}

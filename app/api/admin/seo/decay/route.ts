import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { captureException } from "@/lib/sentry";

/**
 * GET /api/admin/seo/decay?site_id=<uuid>&days=90
 *
 * Lists published content that has not been updated in the given number of
 * days. These are decay candidates: rankings can slip when content goes stale.
 * The frontend/dashboard can turn this list into a "refresh" queue.
 *
 * Requires super_admin because it can query any site's content table.
 */
export async function GET(request: NextRequest) {
  const { error, session } = await requireSuperAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await enforceAdminRateLimit("seo:decay", session);
  if (rl) return rl;

  const siteId = request.nextUrl.searchParams.get("site_id");
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") ?? "90"), 1), 365);

  if (!siteId) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const sb = getPrivilegedSupabaseClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    const { data, error: dbError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: super-admin route, privileged client, site-scoped query.
      .from("content")
      .select("id, title, slug, type, status, updated_at, publish_at, created_at")
      .eq("site_id", siteId)
      .eq("status", "published")
      .or(
        `updated_at.lt.${cutoff.toISOString()},and(updated_at.is.null,created_at.lt.${cutoff.toISOString()})`,
      )
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(100)
      .overrideTypes<
        {
          id: string;
          title: string;
          slug: string;
          type: string;
          status: string;
          updated_at: string | null;
          publish_at: string | null;
          created_at: string;
        }[]
      >();

    if (dbError) throw dbError;

    return NextResponse.json({
      ok: true,
      siteId,
      days,
      cutoff: cutoff.toISOString(),
      count: data?.length ?? 0,
      pages: data ?? [],
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/seo/decay] GET failed", extra: { siteId } });
    return NextResponse.json({ error: "Failed to load decay candidates" }, { status: 500 });
  }
}

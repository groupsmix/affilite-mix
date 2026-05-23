import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getInternalTokenFor } from "@/lib/internal-auth";
import { timingSafeCompare } from "@/lib/cron-auth";
import { getTenantClient } from "@/lib/supabase-server";
import { CONTENT_TAGS, siteTag, type ContentTag } from "@/lib/cache-tags";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/revalidate — On-demand cache revalidation webhook.
 *
 * Call this after admin content changes to propagate updates immediately
 * instead of waiting for the ISR revalidation interval (1 hour).
 *
 * Secured via INTERNAL_API_TOKEN env var — pass it in the Authorization header:
 *   Authorization: Bearer <INTERNAL_API_TOKEN>
 *
 * Body:
 *   {
 *     "tags":    ["content", "products"],          // defaults to all three kinds
 *     "site_id": "<uuid>",                         // REQUIRED: scope to one site
 *     "scope":   "all_sites"                       // break-glass: omit site_id + set scope to purge all
 *   }
 *
 * Tags are always emitted in their site-scoped form (`content:<site_id>`).
 * R-02: `site_id` is now required by default. All-site purge requires
 * explicit `scope: "all_sites"` to prevent accidental fanout.
 */
export async function POST(request: NextRequest) {
  let expected: string;
  try {
    expected = getInternalTokenFor("internal");
  } catch {
    return NextResponse.json({ error: "Internal auth misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  const encoder = new TextEncoder();
  if (!bearer || !timingSafeCompare(encoder.encode(bearer), encoder.encode(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F-005: rate-limit cache invalidation per-token. The endpoint is
  // already INTERNAL_API_TOKEN-gated, but a leaked token could be
  // weaponised into a cache-invalidation flood that hammers the
  // origin DB on every revalidation. Cap to 30 calls / minute.
  // F-20: Use fail-closed policy so leaked tokens can't bypass during outages.
  const rl = await checkRateLimit("revalidate:internal-token", {
    maxRequests: 30,
    windowMs: 60_000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let kinds: ContentTag[] = [...CONTENT_TAGS];
  let siteId: string | null = null;

  try {
    const body = await request.json();
    if (Array.isArray(body.tags) && body.tags.length > 0) {
      const requested = body.tags.filter(
        (t: unknown): t is ContentTag =>
          typeof t === "string" && (CONTENT_TAGS as readonly string[]).includes(t),
      );
      if (requested.length > 0) {
        kinds = requested;
      }
    }
    if (typeof body.site_id === "string" && body.site_id.length > 0) {
      siteId = body.site_id;
    }
    // Note: `body.scope` is documented in the header comment but never
    // consumed — all-sites revalidation is gated by absence of `site_id`
    // plus the REVALIDATE_ALL_SITES_TOKEN break-glass header.
  } catch {
    // No body or invalid JSON — use defaults.
  }

  // F-20: Require site_id by default. All-sites revalidation requires a separate
  // break-glass token (REVALIDATE_ALL_SITES_TOKEN) with stricter rate limits.
  // This limits blast radius if the standard INTERNAL_API_TOKEN is leaked.
  let siteIds: string[];

  if (siteId) {
    siteIds = [siteId];
  } else {
    const allSitesToken = process.env.REVALIDATE_ALL_SITES_TOKEN;
    // Standard token cannot do all-sites revalidation — require the break-glass token
    const bearerIsAllSites = allSitesToken && bearer === allSitesToken;
    if (!bearerIsAllSites) {
      return NextResponse.json(
        {
          error: "site_id is required. Use REVALIDATE_ALL_SITES_TOKEN for cross-site invalidation.",
        },
        { status: 400 },
      );
    }
    // Stricter rate limit for all-sites revalidation
    const allSitesRl = await checkRateLimit("revalidate:all-sites", {
      maxRequests: 5,
      windowMs: 60_000,
      failPolicy: "closed" as const,
    });
    if (!allSitesRl.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded for all-sites revalidation",
          retryAfterMs: allSitesRl.retryAfterMs,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(allSitesRl.retryAfterMs / 1000)) },
        },
      );
    }
    const sb = await getTenantClient();
    const { data: sites, error } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: revalidate webhook uses privileged client; gated by shared secret
      .from("sites")
      .select("id")
      .eq("is_active", true)
      .overrideTypes<{ id: string }[]>();
    if (error) {
      captureException(error, { context: "[api/revalidate] Failed to list active sites:" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    siteIds = (sites ?? []).map((s) => s.id);
  }

  const revalidated: string[] = [];
  for (const id of siteIds) {
    for (const kind of kinds) {
      const tag = siteTag(kind, id);
      void revalidateTag(tag);
      revalidated.push(tag);
    }
  }

  // F-005: structured audit log of every cache-purge call. We log to
  // stdout so the Tail Worker (when LOG_SHIPPER_ENABLED=true) ships the
  // event to durable storage. Sentry breadcrumbs would not retain
  // enough volume for cache-purge auditing.
  console.log(
    JSON.stringify({
      event: "cache.revalidate",
      kinds,
      site_id: siteId,
      site_count: siteIds.length,
      tag_count: revalidated.length,
      timestamp: new Date().toISOString(),
    }),
  );

  return NextResponse.json({
    ok: true,
    revalidated,
    timestamp: new Date().toISOString(),
  });
}

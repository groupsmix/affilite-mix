import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getInternalTokenFor } from "@/lib/internal-auth";
import { getTenantClient } from "@/lib/supabase-server";
import { CONTENT_TAGS, siteTag, type ContentTag } from "@/lib/cache-tags";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { determineAuthMode } from "@/lib/revalidate-auth";
import { isUsableUuid } from "@/lib/security/uuid";

/**
 * POST /api/revalidate — On-demand cache revalidation webhook.
 *
 * Call this after admin content changes to propagate updates immediately
 * instead of waiting for the ISR revalidation interval (1 hour).
 *
 * Authentication:
 *   Per-site revalidation: Authorization: Bearer <INTERNAL_API_TOKEN>
 *   All-sites revalidation: Authorization: Bearer <REVALIDATE_ALL_SITES_TOKEN>
 *
 * Body:
 *   {
 *     "tags":    ["content", "products"],          // defaults to all three kinds
 *     "site_id": "<uuid>"                          // REQUIRED for per-site scope
 *   }
 *
 * Tags are always emitted in their site-scoped form (`content:<site_id>`).
 * R-02: `site_id` is now required by default. All-site purge requires
 * the REVALIDATE_ALL_SITES_TOKEN break-glass token.
 */

export async function POST(request: NextRequest) {
  let internalToken: string;
  try {
    internalToken = getInternalTokenFor("internal");
  } catch {
    // fail-open: best-effort
    return NextResponse.json({ error: "Internal auth misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  const allSitesToken = process.env.REVALIDATE_ALL_SITES_TOKEN;

  // A98-64: Validate bearer against either token independently.
  // The standard INTERNAL_API_TOKEN allows per-site revalidation only.
  // The separate REVALIDATE_ALL_SITES_TOKEN allows all-sites revalidation.
  // These tokens MUST be different in production for blast-radius containment.
  const authMode = determineAuthMode(bearer, internalToken, allSitesToken);
  if (!authMode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F-005: rate-limit cache invalidation per-token. The endpoint is
  // already token-gated, but a leaked token could be weaponised into a
  // cache-invalidation flood that hammers the origin DB on every revalidation.
  // Cap to 30 calls / minute for per-site, 5/min for all-sites.
  // F-20: Use fail-closed policy so leaked tokens can't bypass during outages.
  const rateLimitKey =
    authMode === "all-sites" ? "revalidate:all-sites" : "revalidate:internal-token";
  const rateLimitConfig =
    authMode === "all-sites"
      ? { maxRequests: 5, windowMs: 60_000, failPolicy: "closed" as const }
      : { maxRequests: 30, windowMs: 60_000, failPolicy: "closed" as const };

  const rl = await checkRateLimit(rateLimitKey, rateLimitConfig);
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
    // T1-02: Validate site_id is a well-formed UUID before using it.
    // A present-but-malformed value is rejected rather than ignored, so a
    // typo'd site_id on an all-sites token can't silently widen into a
    // full cross-tenant purge.
    if (typeof body.site_id === "string") {
      if (!isUsableUuid(body.site_id)) {
        return NextResponse.json({ error: "site_id must be a valid UUID" }, { status: 400 });
      }
      siteId = body.site_id;
    }
  } catch {
    // fail-open: best-effort
    // No body or invalid JSON — use defaults.
  }

  // A98-64: Route authorization — per-site token requires site_id;
  // all-sites token can do cross-site purge.
  let siteIds: string[];

  if (siteId) {
    // Both tokens can do per-site revalidation
    siteIds = [siteId];
  } else if (authMode === "all-sites") {
    // Stricter rate limit already applied above for all-sites token
    const sb = await getTenantClient();
    const { data: sites, error } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: revalidate webhook uses privileged client; gated by shared secret
      .from("sites")
      .select("id")
      .eq("is_active", true)
      .overrideTypes<{ id: string }[]>();
    if (error) {
      captureException(error, { context: "[api/revalidate] Failed to list active sites:" });
      return NextResponse.json({ error: "Failed to list active sites" }, { status: 500 });
    }
    siteIds = (sites ?? []).map((s: { id: string }) => s.id);
    logger.info("[api/revalidate] All-sites revalidation executed", {
      site_count: siteIds.length,
      tag_count: kinds.length,
    });
  } else {
    // Per-site token without site_id — reject
    return NextResponse.json(
      {
        error:
          "site_id is required for per-site revalidation. Use REVALIDATE_ALL_SITES_TOKEN for cross-site invalidation.",
      },
      { status: 400 },
    );
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
  logger.info("cache.revalidate", {
    event: "cache.revalidate",
    kinds,
    site_id: siteId,
    site_count: siteIds.length,
    tag_count: revalidated.length,
  });

  return NextResponse.json({
    ok: true,
    revalidated,
    timestamp: new Date().toISOString(),
  });
}

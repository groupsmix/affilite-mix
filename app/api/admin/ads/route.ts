import { NextRequest, NextResponse } from "next/server";
import { listAdPlacements, createAdPlacement } from "@/lib/dal/ad-placements";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import type { AdPlacementType, AdProvider } from "@/types/database";
import { parseImageAdConfig } from "@/lib/ads/image-ad";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

const VALID_PLACEMENT_TYPES: AdPlacementType[] = [
  "sidebar",
  "in_content",
  "header",
  "footer",
  "between_posts",
];
const VALID_PROVIDERS: AdProvider[] = ["adsense", "carbon", "ethicalads", "custom", "image"];

export const GET = withAuthz("ads", "read", async (_request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("ads", session);
  if (rlResponse) return rlResponse;

  try {
    const ads = await listAdPlacements(siteId, () =>
      getTenantClientForSite(siteId, session.userId),
    );
    return NextResponse.json(ads);
  } catch (err) {
    captureException(err, { context: "[api/admin/ads] GET failed:" });
    return NextResponse.json({ error: "Failed to list ad placements" }, { status: 500 });
  }
});

export const POST = withAuthz(
  "ads",
  "create",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("ads", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;

    const name = rawOrError.name;
    const placement_type = rawOrError.placement_type as AdPlacementType;
    const provider = rawOrError.provider as AdProvider;
    const ad_code = rawOrError.ad_code as string | undefined;
    const config = rawOrError.config as Record<string, unknown> | undefined;
    const is_active = rawOrError.is_active as boolean | undefined;
    const priority = rawOrError.priority as number | undefined;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 256) {
      return NextResponse.json({ error: "name too long (max 256 chars)" }, { status: 400 });
    }
    if (!VALID_PLACEMENT_TYPES.includes(placement_type)) {
      return NextResponse.json(
        { error: `placement_type must be one of: ${VALID_PLACEMENT_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    // Self-served image/banner ads carry their creative + destination in
    // `config` and render directly on the public site — validate and
    // normalise those fields, and force `ad_code` to null.
    let resolvedConfig: Record<string, unknown> = config ?? {};
    let resolvedAdCode: string | null = ad_code ?? null;
    if (provider === "image") {
      const imageConfig = parseImageAdConfig(config);
      if ("error" in imageConfig) {
        return NextResponse.json({ error: imageConfig.error }, { status: 400 });
      }
      resolvedConfig = { ...resolvedConfig, ...imageConfig };
      resolvedAdCode = null;
    }

    try {
      // Bind the tenant client to the withAuthz-validated `siteId` so the
      // minted JWT carries app_metadata.site_id and the write satisfies the
      // tenant_isolation RLS WITH CHECK; see the createCategory note in
      // app/api/admin/categories/route.ts for the full rationale.
      const ad = await createAdPlacement(
        {
          site_id: siteId,
          name,
          placement_type,
          provider,
          // For `image` ads the creative + destination live in `config` and
          // ad_code is null. For script/HTML providers ad_code is stored as
          // raw markup; note those providers are not yet rendered on the
          // public site (the CSP frame-src does not allow third-party ad
          // frames) — only `image` placements render today.
          ad_code: resolvedAdCode,
          config: resolvedConfig,
          is_active: is_active ?? true,
          priority: priority ?? 0,
        },
        () => getTenantClientForSite(siteId, session.userId),
      );

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "ad_placement",
        entity_id: ad.id,
        details: { name, placement_type, provider },
      });

      return NextResponse.json(ad, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/ads] POST failed:" });
      return NextResponse.json({ error: "Failed to create ad placement" }, { status: 500 });
    }
  },
);

import { NextRequest, NextResponse } from "next/server";
import { listAdPlacements, createAdPlacement } from "@/lib/dal/ad-placements";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import type { AdPlacementType, AdProvider } from "@/types/database";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";

const VALID_PLACEMENT_TYPES: AdPlacementType[] = [
  "sidebar",
  "in_content",
  "header",
  "footer",
  "between_posts",
];
const VALID_PROVIDERS: AdProvider[] = ["adsense", "carbon", "ethicalads", "custom"];

export const GET = withAuthz("ads", "read", async (_request, { siteId }) => {
  try {
    const ads = await listAdPlacements(siteId);
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

    try {
      const ad = await createAdPlacement({
        site_id: siteId,
        name,
        placement_type,
        provider,
        // ad_code is stored as raw HTML/JS intentionally — it is rendered inside
        // a sandboxed iframe (SandboxedAd) with no `allow-same-origin`, so the
        // ad script cannot access the parent page's DOM, cookies, or storage.
        // See app/(public)/components/sandboxed-ad.tsx for the security model.
        ad_code: ad_code ?? null,
        config: config ?? {},
        is_active: is_active ?? true,
        priority: priority ?? 0,
      });

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

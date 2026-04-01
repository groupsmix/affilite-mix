import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listAdPlacements, createAdPlacement } from "@/lib/dal/ad-placements";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import type { AdPlacementType, AdProvider } from "@/types/database";
import { captureException } from "@/lib/sentry";

const VALID_PLACEMENT_TYPES: AdPlacementType[] = [
  "sidebar",
  "in_content",
  "header",
  "footer",
  "between_posts",
];
const VALID_PROVIDERS: AdProvider[] = ["adsense", "carbon", "ethicalads", "custom"];

export async function GET() {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const ads = await listAdPlacements(dbSiteId);
    return NextResponse.json(ads);
  } catch (err) {
    captureException(err, { context: "[api/admin/ads] GET failed:" });
    return NextResponse.json({ error: "Failed to list ad placements" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

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
      site_id: dbSiteId,
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

    recordAuditEvent({
      site_id: dbSiteId,
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
}

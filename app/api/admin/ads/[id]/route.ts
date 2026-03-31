import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  updateAdPlacement,
  deleteAdPlacement,
} from "@/lib/dal/ad-placements";
import { recordAuditEvent } from "@/lib/audit-log";
import type { AdPlacementType, AdProvider } from "@/types/database";
import { captureException } from "@/lib/sentry";

const VALID_PLACEMENT_TYPES: AdPlacementType[] = ["sidebar", "in_content", "header", "footer", "between_posts"];
const VALID_PROVIDERS: AdProvider[] = ["adsense", "carbon", "ethicalads", "custom"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const raw = await request.json();
  const { name, placement_type, provider, ad_code, config, is_active, priority } = raw;

  if (placement_type && !VALID_PLACEMENT_TYPES.includes(placement_type)) {
    return NextResponse.json({ error: `placement_type must be one of: ${VALID_PLACEMENT_TYPES.join(", ")}` }, { status: 400 });
  }
  if (provider && !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` }, { status: 400 });
  }

  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (placement_type !== undefined) updates.placement_type = placement_type;
    if (provider !== undefined) updates.provider = provider;
    if (ad_code !== undefined) updates.ad_code = ad_code;
    if (config !== undefined) updates.config = config;
    if (is_active !== undefined) updates.is_active = is_active;
    if (priority !== undefined) updates.priority = priority;

    const ad = await updateAdPlacement(dbSiteId, id, updates);

    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "update",
      entity_type: "ad_placement",
      entity_id: id,
      details: updates,
    });

    return NextResponse.json(ad);
  } catch (err) {
    captureException(err, { context: "[api/admin/ads] PUT failed:" });
    return NextResponse.json({ error: "Failed to update ad placement" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    await deleteAdPlacement(dbSiteId, id);

    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "ad_placement",
      entity_id: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/ads] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete ad placement" }, { status: 500 });
  }
}

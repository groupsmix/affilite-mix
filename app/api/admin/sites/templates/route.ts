import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listNicheTemplates,
  createNicheTemplate,
  deleteNicheTemplate,
} from "@/lib/dal/niche-templates";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/** List all available niche templates */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const templates = await listNicheTemplates();
    return NextResponse.json(templates);
  } catch (err) {
    captureException(err, { context: "[api/admin/sites/templates] GET failed:" });
    return NextResponse.json({ error: "Failed to list templates" }, { status: 500 });
  }
}

/** Create a new niche template */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  if (!bodyOrError.name || !bodyOrError.slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  try {
    const template = await createNicheTemplate({
      name: bodyOrError.name as string,
      slug: bodyOrError.slug as string,
      description: (bodyOrError.description as string) ?? "",
      default_theme: (bodyOrError.default_theme as Record<string, unknown>) ?? {},
      default_nav:
        (bodyOrError.default_nav as { label: string; href: string; icon?: string }[]) ?? [],
      default_footer:
        (bodyOrError.default_footer as { label: string; href: string; icon?: string }[]) ?? [],
      default_features: (bodyOrError.default_features as Record<string, boolean>) ?? {},
      monetization_type: (bodyOrError.monetization_type as string) ?? "affiliate",
      language: (bodyOrError.language as string) ?? "en",
      direction: (bodyOrError.direction as string) ?? "ltr",
      social_links: (bodyOrError.social_links as Record<string, string>) ?? {},
    });

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "niche_template",
      entity_id: template.id,
      details: { name: bodyOrError.name as string, slug: bodyOrError.slug as string },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/sites/templates] POST failed:" });
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}

/** Delete a niche template */
export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const delBodyOrError = await parseJsonBody(request);
  if (delBodyOrError instanceof NextResponse) return delBodyOrError;
  const { id } = delBodyOrError;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteNicheTemplate(id as string);

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "niche_template",
      entity_id: id as string,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/sites/templates] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listNicheTemplates,
  createNicheTemplate,
  deleteNicheTemplate,
} from "@/lib/dal/niche-templates";

/** List all available niche templates */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const templates = await listNicheTemplates();
    return NextResponse.json(templates);
  } catch (err) {
    console.error("[api/admin/sites/templates] GET failed:", err);
    return NextResponse.json({ error: "Failed to list templates" }, { status: 500 });
  }
}

/** Create a new niche template */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { name, slug, description, ...rest } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  try {
    const template = await createNicheTemplate({
      name,
      slug,
      description: description ?? "",
      default_theme: rest.default_theme ?? {},
      default_nav: rest.default_nav ?? [],
      default_footer: rest.default_footer ?? [],
      default_features: rest.default_features ?? {},
      monetization_type: rest.monetization_type ?? "affiliate",
      language: rest.language ?? "en",
      direction: rest.direction ?? "ltr",
      custom_css: rest.custom_css ?? "",
      social_links: rest.social_links ?? {},
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error("[api/admin/sites/templates] POST failed:", err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}

/** Delete a niche template */
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteNicheTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/sites/templates] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}

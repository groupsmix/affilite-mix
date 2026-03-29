import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/dal/categories";
import { validateCreateCategory, validateUpdateCategory } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET() {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const categories = await listCategories(dbSiteId);
    return NextResponse.json(categories);
  } catch (err) {
    console.error("[api/admin/categories] GET failed:", err);
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateCreateCategory(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  try {
    const category = await createCategory({
      site_id: dbSiteId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      taxonomy_type: parsed.data.taxonomy_type,
    });

    revalidateTag("categories");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "create",
      entity_type: "category",
      entity_id: category.id,
      details: { name: parsed.data.name, slug: parsed.data.slug },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    console.error("[api/admin/categories] POST create failed:", err);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateUpdateCategory(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  try {
    const category = await updateCategory(dbSiteId, id, updates);
    revalidateTag("categories");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "update",
      entity_type: "category",
      entity_id: id,
      details: updates,
    });
    return NextResponse.json(category);
  } catch (err) {
    console.error("[api/admin/categories] PATCH update failed:", err);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteCategory(dbSiteId, id);
    revalidateTag("categories");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "delete",
      entity_type: "category",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/categories] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { categoriesTag } from "@/lib/cache-tags";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryUsageCounts,
} from "@/lib/dal/categories";
import { validateCreateCategory, validateUpdateCategory } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

export async function GET() {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const categories = await listCategories(dbSiteId);
    return NextResponse.json(categories);
  } catch (err) {
    captureException(err, { context: "[api/admin/categories] GET failed:" });
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateCreateCategory(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const category = await createCategory({
      site_id: dbSiteId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      taxonomy_type: parsed.data.taxonomy_type,
    });

    void revalidateTag(categoriesTag(dbSiteId));
    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "category",
      entity_id: category.id,
      details: { name: parsed.data.name, slug: parsed.data.slug },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/categories] POST create failed:" });
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateUpdateCategory(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsed.data;
  try {
    const category = await updateCategory(dbSiteId, id, updates);
    void revalidateTag(categoriesTag(dbSiteId));
    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "update",
      entity_type: "category",
      entity_id: id,
      details: updates,
    });
    return NextResponse.json(category);
  } catch (err) {
    captureException(err, { context: "[api/admin/categories] PATCH update failed:" });
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  // Accept id from request body (preferred) or query params (backward compat)
  let id: string | null = null;
  try {
    const body = await request.json();
    id = body?.id ?? null;
  } catch {
    // fallback to query params for backward compatibility
  }
  if (!id) {
    id = request.nextUrl.searchParams.get("id");
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteCategory(dbSiteId, id);
    void revalidateTag(categoriesTag(dbSiteId));
    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "category",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/categories] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}

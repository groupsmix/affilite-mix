import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/dal/categories";
import { validateCreateCategory, validateUpdateCategory } from "@/lib/validation";

export async function GET() {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const categories = await listCategories(dbSiteId);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateCreateCategory(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const category = await createCategory({
    site_id: dbSiteId,
    name: parsed.data.name,
    slug: parsed.data.slug,
  });

  return NextResponse.json(category, { status: 201 });
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
  const category = await updateCategory(dbSiteId, id, updates);
  return NextResponse.json(category);
}

export async function DELETE(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteCategory(dbSiteId, id);
  return NextResponse.json({ ok: true });
}

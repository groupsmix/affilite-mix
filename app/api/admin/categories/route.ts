import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/dal/categories";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const categories = await listCategories(session.siteId);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const category = await createCategory({
    site_id: session.siteId,
    name: body.name,
    slug: body.slug,
    description: body.description ?? "",
  });

  return NextResponse.json(category, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const category = await updateCategory(session.siteId, id, updates);
  return NextResponse.json(category);
}

export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteCategory(session.siteId, id);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/dal/products";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const products = await listProducts({
    siteId: session.siteId,
    categoryId: searchParams.get("category_id") ?? undefined,
    status: (searchParams.get("status") as "draft" | "active" | "archived") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
  });

  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const product = await createProduct({
    site_id: session.siteId,
    name: body.name,
    slug: body.slug,
    description: body.description ?? "",
    affiliate_url: body.affiliate_url ?? "",
    image_url: body.image_url ?? "",
    price: body.price ?? "",
    merchant: body.merchant ?? "",
    score: body.score ?? null,
    is_featured: body.is_featured ?? false,
    is_active: body.is_active ?? true,
    status: body.status ?? "active",
    category_id: body.category_id ?? null,
    metadata: body.metadata ?? {},
  });

  return NextResponse.json(product, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const product = await updateProduct(session.siteId, id, updates);
  return NextResponse.json(product);
}

export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteProduct(session.siteId, id);
  return NextResponse.json({ ok: true });
}

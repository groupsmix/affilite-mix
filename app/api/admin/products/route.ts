import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/dal/products";
import { validateCreateProduct, validateUpdateProduct } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const products = await listProducts({
    siteId: dbSiteId,
    categoryId: searchParams.get("category_id") ?? undefined,
    status: (searchParams.get("status") as "draft" | "active" | "archived") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
  });

  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateCreateProduct(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const data = parsed.data;
  const product = await createProduct({
    site_id: dbSiteId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    affiliate_url: data.affiliate_url,
    image_url: data.image_url,
    price: data.price,
    merchant: data.merchant,
    score: data.score,
    featured: data.featured,
    status: data.status,
    category_id: data.category_id,
    cta_text: data.cta_text ?? "",
    deal_text: data.deal_text ?? "",
    deal_expires_at: data.deal_expires_at ?? null,
  });

  revalidateTag("products");
  return NextResponse.json(product, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateUpdateProduct(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  const product = await updateProduct(dbSiteId, id, updates);
  revalidateTag("products");
  return NextResponse.json(product);
}

export async function DELETE(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteProduct(dbSiteId, id);
  revalidateTag("products");
  return NextResponse.json({ ok: true });
}

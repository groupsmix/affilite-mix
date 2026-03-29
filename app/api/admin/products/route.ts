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
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  try {
    const products = await listProducts({
      siteId: dbSiteId,
      categoryId: searchParams.get("category_id") ?? undefined,
      status: (searchParams.get("status") as "draft" | "active" | "archived") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json(products);
  } catch (err) {
    console.error("[api/admin/products] GET failed:", err);
    return NextResponse.json({ error: "Failed to list products" }, { status: 500 });
  }
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
  try {
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
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "create",
      entity_type: "product",
      entity_id: product.id,
      details: { name: data.name, slug: data.slug },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error("[api/admin/products] POST create failed:", err);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
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
  try {
    const product = await updateProduct(dbSiteId, id, updates);
    revalidateTag("products");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "update",
      entity_type: "product",
      entity_id: id,
      details: updates,
    });
    return NextResponse.json(product);
  } catch (err) {
    console.error("[api/admin/products] PATCH update failed:", err);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
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
    await deleteProduct(dbSiteId, id);
    revalidateTag("products");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "delete",
      entity_type: "product",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/products] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { listProducts, createProduct, updateProduct, deleteProduct } from "@/lib/dal/products";
import { validateCreateProduct, validateUpdateProduct } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
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
    captureException(err, { context: "[api/admin/products] GET failed:" });
    return NextResponse.json({ error: "Failed to list products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateCreateProduct(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
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
      image_alt: data.image_alt ?? "",
      price: data.price,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      merchant: data.merchant,
      score: data.score,
      featured: data.featured,
      status: data.status,
      category_id: data.category_id,
      cta_text: data.cta_text ?? "",
      deal_text: data.deal_text ?? "",
      deal_expires_at: data.deal_expires_at ?? null,
      pros: data.pros ?? "",
      cons: data.cons ?? "",
    });

    revalidateTag("products");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "product",
      entity_id: product.id,
      details: { name: data.name, slug: data.slug },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/products] POST create failed:" });
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateUpdateProduct(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsed.data;
  try {
    const product = await updateProduct(dbSiteId, id, updates);
    revalidateTag("products");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "update",
      entity_type: "product",
      entity_id: id,
      details: updates,
    });
    return NextResponse.json(product);
  } catch (err) {
    captureException(err, { context: "[api/admin/products] PATCH update failed:" });
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
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
    await deleteProduct(dbSiteId, id);
    revalidateTag("products");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "product",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/products] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}

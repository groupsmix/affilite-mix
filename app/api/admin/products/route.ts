import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { productsTag } from "@/lib/cache-tags";
import { listProducts, createProduct, updateProduct, deleteProduct, ConflictError } from "@/lib/dal/products";
import { validateCreateProduct, validateUpdateProduct } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz } from "@/lib/authz";
import { authorizeResource, authorizationErrorResponse } from "@/lib/authz";
import { validateAdminUrlFields } from "@/lib/admin-url-guard";

export const GET = withAuthz("products", "view", async (request: NextRequest, { siteId }) => {
  const { searchParams } = request.nextUrl;
  const pagination = parsePagination(searchParams);
  if (pagination instanceof NextResponse) return pagination;

  try {
    const products = await listProducts({
      siteId,
      categoryId: searchParams.get("category_id") ?? undefined,
      status: (searchParams.get("status") as "draft" | "active" | "archived") ?? undefined,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return NextResponse.json(products);
  } catch (err) {
    captureException(err, { context: "[api/admin/products] GET failed:" });
    return NextResponse.json({ error: "Failed to list products" }, { status: 500 });
  }
});

export const POST = withAuthz(
  "products",
  "create",
  async (request: NextRequest, { session, siteId }) => {
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
    // G-01: validate URL-typed fields before persistence.
    const urlErr = validateAdminUrlFields({
      affiliate_url: data.affiliate_url,
      image_url: data.image_url,
    });
    if (urlErr) {
      return NextResponse.json({ error: urlErr.error }, { status: 400 });
    }
    try {
      const product = await createProduct({
        site_id: siteId,
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

      void revalidateTag(productsTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
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
  },
);

export const PATCH = withAuthz(
  "products",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
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

    // ISO18-003 / IDOR defense-in-depth: verify the product belongs to the
    // active tenant before allowing mutation. This closes the TOCTOU gap where
    // a product could be moved between the withAuthz site check and the actual
    // update, and prevents cross-tenant writes via ID guessing.
    const authzResult = await authorizeResource({
      session,
      feature: "products",
      action: "edit",
      resourceType: "product",
      resourceId: id,
      expectedSiteId: siteId,
    });
    if (!authzResult.ok) {
      return authorizationErrorResponse(authzResult);
    }

    // G-01: validate URL fields on edit too (not just create).
    const urlErr = validateAdminUrlFields({
      ...(updates.affiliate_url !== undefined && { affiliate_url: updates.affiliate_url }),
      ...(updates.image_url !== undefined && { image_url: updates.image_url }),
    });
    if (urlErr) {
      return NextResponse.json({ error: urlErr.error }, { status: 400 });
    }
    // ISO18-001: Extract version for optimistic locking. When supplied by the
    // client (from the last GET), concurrent edits are detected and rejected
    // with 409 instead of silently overwriting.
    const expectedVersion =
      typeof rawOrError.version === "number" ? rawOrError.version : undefined;

    try {
      const product = await updateProduct(siteId, id, updates, undefined, expectedVersion);
      void revalidateTag(productsTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "product",
        entity_id: id,
        details: updates,
      });
      return NextResponse.json(product);
    } catch (err) {
      if (err instanceof ConflictError) {
        return NextResponse.json(
          { error: err.message, code: "CONFLICT" },
          { status: 409 },
        );
      }
      captureException(err, { context: "[api/admin/products] PATCH update failed:" });
      return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
    }
  },
);

export const DELETE = withAuthz(
  "products",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    let id: string | null = null;
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) {
      // JSON parse failed — fallback to query params for backward compatibility
    } else {
      id = typeof rawOrError.id === "string" ? rawOrError.id : null;
    }
    if (!id) {
      id = request.nextUrl.searchParams.get("id");
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // RC-05: Validate UUID format before hitting the database
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    // ISO18-003 / IDOR defense-in-depth: verify the product belongs to the
    // active tenant before allowing deletion. Prevents cross-tenant deletes
    // via ID guessing even though deleteProduct filters by siteId.
    const authzResult = await authorizeResource({
      session,
      feature: "products",
      action: "delete",
      resourceType: "product",
      resourceId: id,
      expectedSiteId: siteId,
    });
    if (!authzResult.ok) {
      return authorizationErrorResponse(authzResult);
    }

    try {
      await deleteProduct(siteId, id);
      void revalidateTag(productsTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
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
  },
);

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { productsTag } from "@/lib/cache-tags";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  ConflictError,
} from "@/lib/dal/products";
import { validateCreateProduct, validateUpdateProduct } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { saveErrorResponse } from "@/lib/save-error";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz, authorizeResource, authorizationErrorResponse } from "@/lib/authz";
import { validateAdminUrlFields } from "@/lib/admin-url-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUsableUuid } from "@/lib/security/uuid";
import { getTenantClientForSite } from "@/lib/supabase-server";

export const GET = withAuthz(
  "products",
  "view",
  async (request: NextRequest, { siteId, session }) => {
    // A31-A60 rec #1: Per-user rate limiting on admin product endpoints
    const rl = await checkRateLimit(`admin:products:get:${session.userId}`, {
      maxRequests: 100,
      windowMs: 60_000,
      // S0-F10-001: admin endpoints use "closed" so a KV/DO outage
      // doesn't silently remove rate limiting for authenticated callers.
      failPolicy: "closed" as const,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) },
        },
      );
    }

    const { searchParams } = request.nextUrl;
    const pagination = parsePagination(searchParams);
    if (pagination instanceof NextResponse) return pagination;

    // SECURITY-FIX: Validate category_id format to prevent NoSQL/query injection (T1-006)
    const categoryId = searchParams.get("category_id") ?? undefined;
    if (categoryId && !isUsableUuid(categoryId)) {
      return NextResponse.json({ error: "category_id must be a valid UUID" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const products = await listProducts(
        {
          siteId,
          categoryId,
          status: (searchParams.get("status") as "draft" | "active" | "archived") ?? undefined,
          limit: pagination.limit,
          offset: pagination.offset,
        },
        getClient,
      );

      return NextResponse.json(products);
    } catch (err) {
      captureException(err, { context: "[api/admin/products] GET failed:" });
      return NextResponse.json({ error: "Failed to list products" }, { status: 500 });
    }
  },
);

export const POST = withAuthz(
  "products",
  "create",
  async (request: NextRequest, { session, siteId }) => {
    // A31-A60 rec #1: Per-user rate limiting on admin product mutations
    const rl = await checkRateLimit(`admin:products:mutate:${session.userId}`, {
      maxRequests: 30,
      windowMs: 60_000,
      failPolicy: "closed" as const,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) },
        },
      );
    }

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
      // Bind the tenant client to the withAuthz-validated `siteId` so the
      // minted JWT carries app_metadata.site_id and the write satisfies the
      // tenant_isolation RLS WITH CHECK; see the createCategory note in
      // app/api/admin/categories/route.ts for the full rationale.
      const product = await createProduct(
        {
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
        },
        () => getTenantClientForSite(siteId, session.userId),
      );

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
      // F-010: map known failures (unprovisioned site → FK violation 23503,
      // RLS denial) to an actionable message and attach an error reference id
      // instead of a generic "Failed to create product".
      return saveErrorResponse(err, "[api/admin/products] POST create failed:");
    }
  },
);

export const PATCH = withAuthz(
  "products",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    // A31-A60 rec #1: Per-user rate limiting on admin product mutations
    const rl = await checkRateLimit(`admin:products:mutate:${session.userId}`, {
      maxRequests: 30,
      windowMs: 60_000,
      failPolicy: "closed" as const,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) },
        },
      );
    }

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const parsed = validateUpdateProduct(rawOrError);
    if (parsed.errors) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.errors },
        { status: 400 },
      );
    }

    // SECURITY-FIX: Exclude version from updates to prevent it leaking into the SQL UPDATE payload.
    // The DB trigger manages the version column server-side; client-supplied version is only for optimistic lock check.
    const { id, version: _clientVersion, ...updates } = parsed.data;

    // SECURITY-FIX: Validate UUID format for id (IDOR-002)
    if (!id || !isUsableUuid(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    // ISO18-003 / IDOR defense-in-depth: verify the product belongs to the
    // active tenant before allowing mutation (CWE-639).
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

    // ISO18-001: Extract version for optimistic locking.
    // Use the schema-validated version (positive integer) rather than raw body to prevent type confusion.
    const expectedVersion =
      typeof _clientVersion === "number" && Number.isInteger(_clientVersion) && _clientVersion > 0
        ? _clientVersion
        : undefined;

    try {
      const product = await updateProduct(
        siteId,
        id,
        updates,
        () => getTenantClientForSite(siteId, session.userId),
        expectedVersion,
      );
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
        // A95-001: Log conflict to Sentry so a 409 spike triggers an alert
        // indicating stale-state bugs in the admin UI.
        captureException(err, {
          context: "[api/admin/products] PATCH optimistic lock conflict (409)",
          productId: id,
          siteId,
          level: "warning",
        });
        return NextResponse.json(
          {
            error: err.message,
            code: "CONFLICT",
            hint: "Refresh the product and retry with the latest version.",
          },
          { status: 409, headers: { "Retry-After": "0" } },
        );
      }
      // F-010: actionable message + error reference id for non-conflict failures.
      return saveErrorResponse(err, "[api/admin/products] PATCH update failed:");
    }
  },
);

export const DELETE = withAuthz(
  "products",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    // A31-A60 rec #1: Per-user rate limiting on admin product mutations
    const rl = await checkRateLimit(`admin:products:mutate:${session.userId}`, {
      maxRequests: 30,
      windowMs: 60_000,
      failPolicy: "closed" as const,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) },
        },
      );
    }

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
    if (!isUsableUuid(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    // ISO18-003 / IDOR defense-in-depth: verify the product belongs to the
    // active tenant before allowing deletion (CWE-639).
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
      await deleteProduct(siteId, id, () => getTenantClientForSite(siteId, session.userId));
      void revalidateTag(productsTag(siteId));
      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "delete",
        entity_type: "product",
        entity_id: id,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      // F-010: actionable message + error reference id on delete failures.
      return saveErrorResponse(err, "[api/admin/products] DELETE failed:");
    }
  },
);

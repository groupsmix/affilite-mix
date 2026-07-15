import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { categoriesTag } from "@/lib/cache-tags";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/dal/categories";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { validateCreateCategory, validateUpdateCategory } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

export const GET = withAuthz("categories", "view", async (_request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("categories", session);
  if (rlResponse) return rlResponse;

  try {
    const categories = await listCategories(siteId, {}, () =>
      getTenantClientForSite(siteId, session.userId),
    );
    return NextResponse.json(categories);
  } catch (err) {
    captureException(err, { context: "[api/admin/categories] GET failed:" });
    return apiError(500, "Failed to list categories", undefined, undefined, "INTERNAL_ERROR");
  }
});

export const POST = withAuthz(
  "categories",
  "create",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("categories", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const parsed = validateCreateCategory(rawOrError);
    if (parsed.errors) {
      return apiError(400, "Validation failed", parsed.errors, undefined, "VALIDATION_ERROR");
    }

    try {
      // Bind the tenant client to the withAuthz-validated `siteId` so the
      // minted JWT carries the app_metadata.site_id claim. Without it the admin
      // write request can reach RLS with no site claim and fail the
      // tenant_isolation WITH CHECK (Postgres 42501) — surfacing as
      // "Failed to create category". This keeps RLS enforcing isolation rather
      // than bypassing it via service_role.
      const category = await createCategory(
        {
          site_id: siteId,
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          taxonomy_type: parsed.data.taxonomy_type,
        },
        () => getTenantClientForSite(siteId, session.userId),
      );

      void revalidateTag(categoriesTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "category",
        entity_id: category.id,
        details: { name: parsed.data.name, slug: parsed.data.slug },
      });
      return NextResponse.json(category, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/categories] POST create failed:" });
      return apiError(500, "Failed to create category", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

export const PATCH = withAuthz(
  "categories",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("categories", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const parsed = validateUpdateCategory(rawOrError);
    if (parsed.errors) {
      return apiError(400, "Validation failed", parsed.errors, undefined, "VALIDATION_ERROR");
    }

    const { id, ...updates } = parsed.data;
    try {
      const category = await updateCategory(siteId, id, updates, () =>
        getTenantClientForSite(siteId, session.userId),
      );
      void revalidateTag(categoriesTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "category",
        entity_id: id,
        details: updates,
      });
      return NextResponse.json(category);
    } catch (err) {
      captureException(err, { context: "[api/admin/categories] PATCH update failed:" });
      return apiError(500, "Failed to update category", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

export const DELETE = withAuthz(
  "categories",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("categories", session);
    if (rlResponse) return rlResponse;

    let id: string | null = null;
    const bodyOrErr = await parseJsonBody(request);
    if (!(bodyOrErr instanceof NextResponse)) {
      id = (bodyOrErr as { id?: string }).id ?? null;
    }
    if (!id) {
      id = request.nextUrl.searchParams.get("id");
    }
    if (!id) {
      return apiError(400, "id is required", undefined, undefined, "BAD_REQUEST");
    }

    try {
      await deleteCategory(siteId, id, () => getTenantClientForSite(siteId, session.userId));
      void revalidateTag(categoriesTag(siteId));
      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "delete",
        entity_type: "category",
        entity_id: id,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/categories] DELETE failed:" });
      return apiError(500, "Failed to delete category", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

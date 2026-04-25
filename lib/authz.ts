import { NextResponse, NextRequest } from "next/server";
import { getAdminSession, AdminPayload } from "./auth";
import { hasPermission } from "./dal/permissions";
import type { PermissionFeature, PermissionAction } from "@/types/database";
import { apiError } from "./api-error";

export type AuthenticatedRouteHandler = (
  request: NextRequest,
  context: { params: Record<string, string>; session: AdminPayload },
) => Promise<NextResponse> | NextResponse;

export function withAuthz(
  feature: PermissionFeature,
  action: PermissionAction,
  handler: AuthenticatedRouteHandler,
) {
  return async (request: NextRequest, context: { params: Record<string, string> }) => {
    const session = await getAdminSession();
    if (!session || !session.userId) {
      return apiError(401, "Unauthorized");
    }

    const url = new URL(request.url);
    const siteId = url.searchParams.get("site_id");

    // Some routes might be global and not need a site_id, but if they do,
    // and they specify a site_id, we check it.
    if (siteId) {
      const allowed = await hasPermission(session.userId, siteId, feature, action);
      if (!allowed) {
        return apiError(403, "Forbidden");
      }
    } else {
      // If the route doesn't specify a site_id but requires authz,
      // we check if they have super_admin global role.
      // (This mimics the global bypass in hasPermission)
      if (session.role !== "super_admin") {
        return apiError(403, "Forbidden: Missing site_id context for permission check");
      }
    }

    return handler(request, { ...context, session });
  };
}

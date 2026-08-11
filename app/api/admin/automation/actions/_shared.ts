import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { COOKIE_NAME } from "@/lib/auth";
import { getAutomationActionById } from "@/lib/dal/automation-actions";

const LEGACY_COOKIE_NAME = "nh_admin_token";
type AdminResult = Awaited<ReturnType<typeof requireAdmin>>;

export async function requireHumanAdmin(request: NextRequest, existing?: AdminResult) {
  const result = existing ?? (await requireAdmin());
  if (result.error) return { response: result.error } as const;
  if (!result.session || !result.dbSiteId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!request.cookies.get(COOKIE_NAME) && !request.cookies.get(LEGACY_COOKIE_NAME)) {
    return {
      response: NextResponse.json(
        { error: "Owner approval requires an interactive admin session" },
        { status: 403 },
      ),
    } as const;
  }
  const roleError = assertRole(result.session, "admin");
  if (roleError) return { response: roleError } as const;
  return { ...result, response: null } as const;
}

export async function getSiteAction(siteId: string, id: string) {
  return getAutomationActionById(siteId, id);
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";

type AdminResult = Awaited<ReturnType<typeof requireAdmin>>;

export async function requireHumanAdmin(request: NextRequest, existing?: AdminResult) {
  const result = existing ?? (await requireAdmin(request));
  if (result.error) return { response: result.error } as const;
  if (!result.session || !result.dbSiteId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (result.caller.type !== "interactive") {
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

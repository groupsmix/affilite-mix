import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";

/** GET /api/admin/sites/active — return the currently selected active site ID from the httpOnly cookie */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeSiteId = await getActiveSiteSlug();
  return NextResponse.json({ activeSiteId });
}

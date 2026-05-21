import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getActiveSiteSlug } from "@/lib/active-site";

/** GET /api/admin/sites/active — return the currently selected active site ID from the httpOnly cookie */
export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeSiteId = await getActiveSiteSlug();
  return NextResponse.json({ activeSiteId });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getCategoryUsageCounts } from "@/lib/dal/categories";

/** GET /api/admin/categories/usage?id=... — get usage counts for a category */
export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const counts = await getCategoryUsageCounts(dbSiteId, id);
  return NextResponse.json(counts);
}

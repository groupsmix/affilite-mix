import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { reorderPages } from "@/lib/dal/pages";

/**
 * PUT /api/admin/pages/reorder
 * Body: { pages: [{ id, sort_order }] }
 */
export async function PUT(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!Array.isArray(body.pages)) {
      return NextResponse.json(
        { error: "pages array is required" },
        { status: 400 },
      );
    }

    await reorderPages(body.pages);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

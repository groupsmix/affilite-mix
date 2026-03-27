import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { setLinkedProducts } from "@/lib/dal/content-products";
import { validateSetLinkedProducts } from "@/lib/validation";

export async function PUT(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateSetLinkedProducts(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  await setLinkedProducts(parsed.data.content_id, dbSiteId, parsed.data.links);
  return NextResponse.json({ ok: true });
}

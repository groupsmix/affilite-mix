import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { setLinkedProducts } from "@/lib/dal/content-products";
import { validateSetLinkedProducts } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit-log";

export async function PUT(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateSetLinkedProducts(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  try {
    await setLinkedProducts(parsed.data.content_id, dbSiteId, parsed.data.links);
    revalidateTag("content");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: "admin",
      action: "update",
      entity_type: "content_products",
      entity_id: parsed.data.content_id,
      details: { linked_count: parsed.data.links.length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/content-products] PUT failed:", err);
    return NextResponse.json({ error: "Failed to update linked products" }, { status: 500 });
  }
}

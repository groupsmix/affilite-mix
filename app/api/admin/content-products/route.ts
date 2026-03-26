import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { setLinkedProducts } from "@/lib/dal/content-products";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function PUT(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { content_id, links } = body as {
    content_id: string;
    links: { product_id: string; role: "hero" | "featured" | "related" | "vs-left" | "vs-right" }[];
  };

  if (!content_id) {
    return NextResponse.json({ error: "content_id is required" }, { status: 400 });
  }

  const dbSiteId = await resolveDbSiteId(session.siteId);
  await setLinkedProducts(content_id, dbSiteId, links ?? []);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { setLinkedProducts } from "@/lib/dal/content-products";

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
    links: { product_id: string; position: number; role: "hero" | "featured" | "related" | "vs-left" | "vs-right"; custom_aff_url: string | null }[];
  };

  if (!content_id) {
    return NextResponse.json({ error: "content_id is required" }, { status: 400 });
  }

  await setLinkedProducts(content_id, session.siteId, links ?? []);
  return NextResponse.json({ ok: true });
}

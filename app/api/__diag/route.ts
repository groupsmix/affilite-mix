import { NextResponse } from "next/server";
import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listActiveProducts } from "@/lib/dal/products";
import { getAnonClient } from "@/lib/supabase-server";
import { resolveDbSiteId, resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// TEMPORARY DIAGNOSTIC — remove after debugging the category 500.
function err(e: unknown) {
  if (e instanceof Error)
    return { name: e.name, message: e.message, stack: (e.stack || "").slice(0, 800) };
  try {
    return { raw: JSON.stringify(e) };
  } catch {
    return { raw: String(e) };
  }
}

export async function GET() {
  const out: Record<string, unknown> = {};
  // What did middleware inject?
  try {
    const h = await headers();
    out.x_site_id_header = h.get("x-site-id");
  } catch (e) {
    out.headers_ERROR = err(e);
  }
  // Resolution chain (each independently)
  try {
    out.resolveDbSiteId = await resolveDbSiteId("watch-tools");
  } catch (e) {
    out.resolveDbSiteId_ERROR = err(e);
  }
  try {
    const r = await resolveDbSiteBySlug("watch-tools");
    out.resolveDbSiteBySlug = r ? { id: r.id, slug: r.slug } : null;
  } catch (e) {
    out.resolveDbSiteBySlug_ERROR = err(e);
  }
  let siteId = "";
  try {
    const site = await getCurrentSite();
    siteId = site.id;
    out.getCurrentSite = { id: site.id, name: site.name, domain: site.domain };
  } catch (e) {
    out.getCurrentSite_ERROR = err(e);
    return NextResponse.json(out);
  }
  await Promise.all([
    (async () => {
      try {
        const c = await getCategoryBySlug(siteId, "seiko");
        out.getCategoryBySlug = c ? { id: c.id, slug: c.slug } : null;
      } catch (e) {
        out.getCategoryBySlug_ERROR = err(e);
      }
    })(),
    (async () => {
      try {
        const r = await listContent({ siteId, status: "published", limit: 3 }, getAnonClient);
        out.listContent = r.length;
      } catch (e) {
        out.listContent_ERROR = err(e);
      }
    })(),
    (async () => {
      try {
        out.countContent = await countContent({ siteId, status: "published" }, getAnonClient);
      } catch (e) {
        out.countContent_ERROR = err(e);
      }
    })(),
    (async () => {
      try {
        const p = await listActiveProducts(siteId, "seiko");
        out.listActiveProducts = p.length;
      } catch (e) {
        out.listActiveProducts_ERROR = err(e);
      }
    })(),
  ]);
  return NextResponse.json(out);
}

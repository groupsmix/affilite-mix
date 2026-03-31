import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listProducts } from "@/lib/dal/products";
import { captureException } from "@/lib/sentry";

/** GET /api/admin/products/export — download all products as CSV */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
  const products = await listProducts({ siteId: guard.dbSiteId });

  const headers = [
    "name",
    "slug",
    "description",
    "affiliate_url",
    "image_url",
    "image_alt",
    "price",
    "merchant",
    "score",
    "featured",
    "status",
    "cta_text",
    "deal_text",
    "deal_expires_at",
  ];

  function escapeCsv(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  const rows = products.map((p) =>
    [
      p.name,
      p.slug,
      p.description,
      p.affiliate_url,
      p.image_url,
      p.image_alt,
      p.price,
      p.merchant,
      p.score?.toString() ?? "",
      p.featured ? "true" : "false",
      p.status,
      p.cta_text,
      p.deal_text,
      p.deal_expires_at ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="products-${guard.siteSlug}-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
  } catch (err) {
    captureException(err, { context: "[api/admin/products/export] GET failed:" });
    return NextResponse.json({ error: "Failed to export products" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createProduct } from "@/lib/dal/products";
import { recordAuditEvent } from "@/lib/audit-log";

/** POST /api/admin/products/import — bulk import products from CSV */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  const requiredFields = ["name", "slug"];
  for (const field of requiredFields) {
    if (!headers.includes(field)) {
      return NextResponse.json({ error: `CSV missing required column: ${field}` }, { status: 400 });
    }
  }

  const results: { row: number; name: string; status: "created" | "error"; error?: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });

    if (!row.name || !row.slug) {
      results.push({ row: i + 1, name: row.name || "(empty)", status: "error", error: "Missing name or slug" });
      continue;
    }

    try {
      await createProduct({
        site_id: guard.dbSiteId,
        name: row.name,
        slug: row.slug,
        description: row.description ?? "",
        affiliate_url: row.affiliate_url ?? "",
        image_url: row.image_url ?? "",
        price: row.price ?? "",
        merchant: row.merchant ?? "",
        score: row.score ? parseFloat(row.score) : null,
        featured: row.featured === "true",
        status: (["draft", "active", "archived"].includes(row.status) ? row.status : "active") as "draft" | "active" | "archived",
        category_id: null,
        cta_text: row.cta_text ?? "",
        deal_text: row.deal_text ?? "",
        deal_expires_at: row.deal_expires_at || null,
      });
      results.push({ row: i + 1, name: row.name, status: "created" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ row: i + 1, name: row.name, status: "error", error: msg });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const errors = results.filter((r) => r.status === "error").length;

  recordAuditEvent({
    site_id: guard.dbSiteId,
    actor: guard.session.email ?? "admin",
    action: "bulk_import",
    entity_type: "product",
    entity_id: "bulk",
    details: { created, errors, total: results.length },
  });

  return NextResponse.json({ created, errors, total: results.length, results });
}

/** Parse a CSV line, handling quoted fields */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

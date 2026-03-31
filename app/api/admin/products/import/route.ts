import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createProduct } from "@/lib/dal/products";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";

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

  try {
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

    // Per-field validation
    const fieldErrors: string[] = [];

    if (row.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
      fieldErrors.push("slug must be lowercase alphanumeric with hyphens (e.g. my-product)");
    }

    if (row.affiliate_url && !/^https?:\/\/.+/.test(row.affiliate_url)) {
      fieldErrors.push("affiliate_url must be a valid HTTP(S) URL");
    }

    if (row.image_url && !/^https?:\/\/.+/.test(row.image_url)) {
      fieldErrors.push("image_url must be a valid HTTP(S) URL");
    }

    const parsedPriceAmount = row.price_amount ? parseFloat(row.price_amount) : null;
    if (row.price_amount && (parsedPriceAmount === null || isNaN(parsedPriceAmount) || parsedPriceAmount < 0)) {
      fieldErrors.push("price_amount must be a non-negative number");
    }

    const parsedScore = row.score ? parseFloat(row.score) : null;
    if (row.score && (parsedScore === null || isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10)) {
      fieldErrors.push("score must be a number between 0 and 10");
    }

    if (row.status && !["draft", "active", "archived"].includes(row.status)) {
      fieldErrors.push(`status must be draft, active, or archived (got "${row.status}")`);
    }

    if (row.deal_expires_at && isNaN(Date.parse(row.deal_expires_at))) {
      fieldErrors.push("deal_expires_at must be a valid ISO date");
    }

    if (fieldErrors.length > 0) {
      results.push({ row: i + 1, name: row.name, status: "error", error: fieldErrors.join("; ") });
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
        image_alt: row.image_alt ?? "",
        price: row.price ?? "",
        price_amount: parsedPriceAmount,
        price_currency: row.price_currency ?? "USD",
        merchant: row.merchant ?? "",
        score: parsedScore,
        featured: row.featured === "true",
        status: (row.status as "draft" | "active" | "archived") || "active",
        category_id: null,
        cta_text: row.cta_text ?? "",
        deal_text: row.deal_text ?? "",
        deal_expires_at: row.deal_expires_at || null,
        pros: row.pros ?? "",
        cons: row.cons ?? "",
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
  } catch (err) {
    captureException(err, { context: "[api/admin/products/import] POST failed:" });
    return NextResponse.json({ error: "Failed to import products" }, { status: 500 });
  }
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

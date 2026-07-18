import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { bulkCreateProducts } from "@/lib/dal/products";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { validateAdminUrl } from "@/lib/admin-url-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/** POST /api/admin/products/import — bulk import products from CSV */
export const POST = withAuthz("products", "create", async (request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("products-import", session);
  if (rlResponse) return rlResponse;

  // Audit U-7: bound the request body and the row count so an admin
  // (or an XSS-against-admin) can't OOM the worker by uploading a 1 GB
  // CSV. The Worker request limit is 100 MB, but our use case is well
  // under 5 MB / 50 000 rows.
  const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_CSV_ROWS = 50_000;

  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `CSV body exceeds the ${MAX_CSV_BYTES / (1024 * 1024)}MB limit` },
      { status: 413 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `CSV file exceeds the ${MAX_CSV_BYTES / (1024 * 1024)}MB limit` },
      { status: 413 },
    );
  }

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json(
      { error: "CSV must have a header row and at least one data row" },
      { status: 400 },
    );
  }
  if (lines.length - 1 > MAX_CSV_ROWS) {
    return NextResponse.json(
      { error: `CSV row count exceeds the ${MAX_CSV_ROWS} row limit` },
      { status: 413 },
    );
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine!).map((h) => h.trim().toLowerCase());

  const requiredFields = ["name", "slug"];
  for (const field of requiredFields) {
    if (!headers.includes(field)) {
      return NextResponse.json({ error: `CSV missing required column: ${field}` }, { status: 400 });
    }
  }

  try {
    const results: { row: number; name: string; status: "created" | "error"; error?: string }[] =
      [];
    const validRows: {
      rowIndex: number;
      name: string;
      product: Parameters<typeof bulkCreateProducts>[0][number];
    }[] = [];

    // Phase 1: Validate all rows
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() ?? "";
      });

      if (!row.name || !row.slug) {
        results.push({
          row: i + 1,
          name: row.name || "(empty)",
          status: "error",
          error: "Missing name or slug",
        });
        continue;
      }

      // Per-field validation
      const fieldErrors: string[] = [];

      if (row.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
        fieldErrors.push("slug must be lowercase alphanumeric with hyphens (e.g. my-product)");
      }

      // G-01: full SSRF-aware URL validation (https only, no literal
      // private / metadata IPs, no wildcard DNS).
      if (row.affiliate_url) {
        const r = validateAdminUrl(row.affiliate_url);
        if (!r.valid) fieldErrors.push(`affiliate_url: ${r.error}`);
      }
      if (row.image_url) {
        const r = validateAdminUrl(row.image_url);
        if (!r.valid) fieldErrors.push(`image_url: ${r.error}`);
      }

      const parsedPriceAmount = row.price_amount ? parseFloat(row.price_amount) : null;
      if (
        row.price_amount &&
        (parsedPriceAmount === null || isNaN(parsedPriceAmount) || parsedPriceAmount < 0)
      ) {
        fieldErrors.push("price_amount must be a non-negative number");
      }

      const parsedScore = row.score ? parseFloat(row.score) : null;
      if (
        row.score &&
        (parsedScore === null || isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10)
      ) {
        fieldErrors.push("score must be a number between 0 and 10");
      }

      if (row.status && !["draft", "active", "archived"].includes(row.status)) {
        fieldErrors.push(`status must be draft, active, or archived (got "${row.status}")`);
      }

      if (row.deal_expires_at && isNaN(Date.parse(row.deal_expires_at))) {
        fieldErrors.push("deal_expires_at must be a valid ISO date");
      }

      if (fieldErrors.length > 0) {
        results.push({
          row: i + 1,
          name: row.name,
          status: "error",
          error: fieldErrors.join("; "),
        });
        continue;
      }

      validRows.push({
        rowIndex: i + 1,
        name: row.name,
        product: {
          site_id: siteId,
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
          category_ids: [],
          cta_text: row.cta_text ?? "",
          deal_text: row.deal_text ?? "",
          deal_expires_at: row.deal_expires_at || null,
          pros: row.pros ?? "",
          cons: row.cons ?? "",
        },
      });
    }

    // Phase 2: Batch-insert all validated rows atomically
    if (validRows.length > 0) {
      try {
        await bulkCreateProducts(validRows.map((v) => v.product));
        for (const v of validRows) {
          results.push({ row: v.rowIndex, name: v.name, status: "created" });
        }
      } catch (err) {
        // If the batch insert fails, report the error for all valid rows
        const msg = err instanceof Error ? err.message : "Database insert failed";
        captureException(err, { context: "[api/admin/products/import] bulk insert failed:" });
        for (const v of validRows) {
          results.push({ row: v.rowIndex, name: v.name, status: "error", error: msg });
        }
      }
    }

    // Sort results by row number for consistent output
    results.sort((a, b) => a.row - b.row);

    const created = results.filter((r) => r.status === "created").length;
    const errors = results.filter((r) => r.status === "error").length;

    void recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? "admin",
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
});

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

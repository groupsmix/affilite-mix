"use client";

import { useState, useRef, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface CsvRow {
  [key: string]: string;
}

interface ImportResult {
  created: number;
  errors: number;
  total: number;
  results: { row: number; name: string; status: string; error?: string }[];
}

/** Parse a single CSV line handling quoted fields */
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

/** Validate a single parsed row and return error messages */
function validateRow(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("name is required");
  if (!row.slug) errors.push("slug is required");
  if (row.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
    errors.push("slug must be lowercase alphanumeric with hyphens");
  }
  if (row.affiliate_url && !/^https?:\/\/.+/.test(row.affiliate_url)) {
    errors.push("affiliate_url must be a valid URL");
  }
  if (row.image_url && !/^https?:\/\/.+/.test(row.image_url)) {
    errors.push("image_url must be a valid URL");
  }
  if (row.price_amount) {
    const n = parseFloat(row.price_amount);
    if (isNaN(n) || n < 0) errors.push("price_amount must be a non-negative number");
  }
  if (row.score) {
    const n = parseFloat(row.score);
    if (isNaN(n) || n < 0 || n > 10) errors.push("score must be 0-10");
  }
  if (row.status && !["draft", "active", "archived"].includes(row.status)) {
    errors.push(`invalid status "${row.status}"`);
  }
  return errors;
}

export function CsvTools() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: CsvRow[];
    warnings: { row: number; messages: string[] }[];
    duplicateSlugs: string[];
    file: File;
  } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const res = await fetch("/api/admin/products/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") ??
      "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleFileSelect = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setResult(null);
    setPreview(null);

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      setResult({
        created: 0,
        errors: 1,
        total: 0,
        results: [
          {
            row: 0,
            name: "",
            status: "error",
            error: "CSV must have a header row and at least one data row",
          },
        ],
      });
      return;
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    if (!headers.includes("name") || !headers.includes("slug")) {
      setResult({
        created: 0,
        errors: 1,
        total: 0,
        results: [
          { row: 0, name: "", status: "error", error: "CSV missing required columns: name, slug" },
        ],
      });
      return;
    }

    const rows: CsvRow[] = [];
    const warnings: { row: number; messages: string[] }[] = [];
    const slugCounts = new Map<string, number[]>();

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const row: CsvRow = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() ?? "";
      });
      rows.push(row);

      const errs = validateRow(row);
      if (errs.length > 0) {
        warnings.push({ row: i + 1, messages: errs });
      }

      if (row.slug) {
        const existing = slugCounts.get(row.slug) ?? [];
        existing.push(i + 1);
        slugCounts.set(row.slug, existing);
      }
    }

    const duplicateSlugs: string[] = [];
    slugCounts.forEach((rowNums, slug) => {
      if (rowNums.length > 1) {
        duplicateSlugs.push(`"${slug}" (rows ${rowNums.join(", ")})`);
      }
    });

    setPreview({ headers, rows, warnings, duplicateSlugs, file });
  }, []);

  async function confirmImport() {
    if (!preview) return;

    setImporting(true);
    setResult(null);
    setProgress({ current: 0, total: preview.rows.length });

    const formData = new FormData();
    formData.append("file", preview.file);

    const res = await fetchWithCsrf("/api/admin/products/import", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      setResult(data);
    } else {
      setResult({
        created: 0,
        errors: 1,
        total: 0,
        results: [{ row: 0, name: "", status: "error", error: data.error }],
      });
    }

    setImporting(false);
    setProgress(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function cancelPreview() {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Bulk Import / Export</h3>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export CSV
        </button>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          {importing ? "Importing..." : "Import CSV"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={importing}
            className="hidden"
          />
        </label>
      </div>

      {/* Progress indicator */}
      {importing && progress && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full animate-pulse rounded-full bg-blue-500"
                style={{ width: "100%" }}
              />
            </div>
            <span>Importing {progress.total} rows...</span>
          </div>
        </div>
      )}

      {/* Preview before import */}
      {preview && !importing && (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Preview: {preview.rows.length} row(s) found with {preview.headers.length} columns
          </div>

          {/* Duplicate slug warnings */}
          {preview.duplicateSlugs.length > 0 && (
            <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p className="font-medium">Duplicate slugs detected:</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {preview.duplicateSlugs.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation warnings */}
          {preview.warnings.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">
                {preview.warnings.length} row(s) have validation issues:
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {preview.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.messages.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div className="max-h-48 overflow-auto rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-gray-500">#</th>
                  {preview.headers.slice(0, 6).map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium text-gray-500">
                      {h}
                    </th>
                  ))}
                  {preview.headers.length > 6 && (
                    <th className="px-2 py-1 text-left font-medium text-gray-500">
                      +{preview.headers.length - 6} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-gray-500">{i + 2}</td>
                    {preview.headers.slice(0, 6).map((h) => (
                      <td key={h} className="max-w-[120px] truncate px-2 py-1 text-gray-700">
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {preview.rows.length > 5 && (
                  <tr className="border-t border-gray-100">
                    <td
                      colSpan={Math.min(preview.headers.length, 6) + 1}
                      className="px-2 py-1 text-center text-gray-500"
                    >
                      ...and {preview.rows.length - 5} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmImport}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Confirm Import
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3">
          <div
            className={`rounded p-3 text-sm ${result.errors > 0 ? "bg-yellow-50 text-yellow-800" : "bg-green-50 text-green-800"}`}
          >
            Imported {result.created} of {result.total} products.
            {result.errors > 0 && ` ${result.errors} error(s).`}
          </div>
          {result.results.filter((r) => r.status === "error").length > 0 && (
            <details className="mt-2" open>
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                Show errors ({result.results.filter((r) => r.status === "error").length})
              </summary>
              <ul className="mt-1 space-y-1 text-xs text-red-600">
                {result.results
                  .filter((r) => r.status === "error")
                  .map((r, i) => (
                    <li key={i}>
                      Row {r.row}: {r.name} — {r.error}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

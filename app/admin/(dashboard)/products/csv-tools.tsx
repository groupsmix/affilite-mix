"use client";

import { useState, useRef } from "react";

export function CsvTools() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    errors: number;
    total: number;
    results: { row: number; name: string; status: string; error?: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const res = await fetch("/api/admin/products/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") ?? "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/products/import", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      setResult(data);
    } else {
      setResult({ created: 0, errors: 1, total: 0, results: [{ row: 0, name: "", status: "error", error: data.error }] });
    }

    setImporting(false);
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importing ? "Importing..." : "Import CSV"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            disabled={importing}
            className="hidden"
          />
        </label>
      </div>

      {result && (
        <div className="mt-3">
          <div className={`rounded p-3 text-sm ${result.errors > 0 ? "bg-yellow-50 text-yellow-800" : "bg-green-50 text-green-800"}`}>
            Imported {result.created} of {result.total} products.
            {result.errors > 0 && ` ${result.errors} error(s).`}
          </div>
          {result.results.filter((r) => r.status === "error").length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                Show errors
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

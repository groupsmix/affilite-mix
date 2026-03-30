"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function ContentBulkActions({ selectedIds, onClear }: BulkActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });

  if (selectedIds.length === 0) return null;

  async function bulkUpdateStatus(status: string) {
    const total = selectedIds.length;
    setLoading(true);
    setProgress({ current: 0, total, label: `Updating to ${status}` });
    let failed = 0;

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total, label: `Updating to ${status}` });
      try {
        const res = await fetchWithCsrf("/api/admin/content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedIds[i], status }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      alert(`${failed} update(s) failed`);
    }
    setProgress({ current: 0, total: 0, label: "" });
    onClear();
    setLoading(false);
    router.refresh();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.length} content item(s)? This cannot be undone.`)) return;
    const total = selectedIds.length;
    setLoading(true);
    setProgress({ current: 0, total, label: "Deleting" });
    let failed = 0;

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total, label: "Deleting" });
      try {
        const res = await fetchWithCsrf(`/api/admin/content?id=${selectedIds[i]}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      alert(`${failed} deletion(s) failed`);
    }
    setProgress({ current: 0, total: 0, label: "" });
    onClear();
    setLoading(false);
    router.refresh();
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-1">
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
      <span className="text-sm font-medium text-blue-700">
        {loading && progress.total > 0
          ? `${progress.label} ${progress.current} of ${progress.total}…`
          : `${selectedIds.length} selected`}
      </span>
      <button
        onClick={() => bulkUpdateStatus("published")}
        disabled={loading}
        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Publish
      </button>
      <button
        onClick={() => bulkUpdateStatus("draft")}
        disabled={loading}
        className="rounded bg-yellow-500 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
      >
        Set Draft
      </button>
      <button
        onClick={() => bulkUpdateStatus("archived")}
        disabled={loading}
        className="rounded bg-gray-500 px-3 py-1 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
      >
        Archive
      </button>
      <button
        onClick={bulkDelete}
        disabled={loading}
        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Delete
      </button>
      <button
        onClick={onClear}
        className="ml-auto text-xs text-blue-600 hover:underline"
      >
        Clear
      </button>
    </div>
    {loading && progress.total > 0 && (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    )}
    </div>
  );
}

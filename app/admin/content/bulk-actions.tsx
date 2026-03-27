"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function ContentBulkActions({ selectedIds, onClear }: BulkActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  async function bulkUpdateStatus(status: string) {
    setLoading(true);
    const results = await Promise.allSettled(
      selectedIds.map((id) =>
        fetch("/api/admin/content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status }),
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      alert(`${failed} update(s) failed`);
    }
    onClear();
    setLoading(false);
    router.refresh();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.length} content item(s)? This cannot be undone.`)) return;
    setLoading(true);
    const results = await Promise.allSettled(
      selectedIds.map((id) =>
        fetch(`/api/admin/content?id=${id}`, { method: "DELETE" }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      alert(`${failed} deletion(s) failed`);
    }
    onClear();
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
      <span className="text-sm font-medium text-blue-700">
        {selectedIds.length} selected
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
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

export function CategoryDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageCounts, setUsageCounts] = useState<{
    contentCount: number;
    productCount: number;
  } | null>(null);

  async function openConfirmDialog() {
    setShowConfirm(true);
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/categories/usage?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setUsageCounts(data);
      }
    } catch {
      // Non-critical — dialog still works without counts
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetchWithCsrf(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Category deleted");
      router.refresh();
    } else {
      toast.error("Failed to delete category");
    }
    setDeleting(false);
    setShowConfirm(false);
    setUsageCounts(null);
  }

  const totalAffected = (usageCounts?.contentCount ?? 0) + (usageCounts?.productCount ?? 0);

  return (
    <>
      <button onClick={openConfirmDialog} className="text-sm text-red-600 hover:underline">
        Delete
      </button>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Category</h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete <strong>&ldquo;{name}&rdquo;</strong>? This action
              cannot be undone.
            </p>
            {loading && (
              <p className="mb-4 text-xs text-gray-500">Checking for associated records…</p>
            )}
            {!loading && totalAffected > 0 && (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">This category has associated records:</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {usageCounts!.contentCount > 0 && (
                    <li>
                      {usageCounts!.contentCount} content item
                      {usageCounts!.contentCount !== 1 ? "s" : ""}
                    </li>
                  )}
                  {usageCounts!.productCount > 0 && (
                    <li>
                      {usageCounts!.productCount} product
                      {usageCounts!.productCount !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-xs">
                  These records will have their category set to &ldquo;None&rdquo; after deletion.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setUsageCounts(null);
                }}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

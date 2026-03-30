"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

export function ProductDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetchWithCsrf(`/api/admin/products?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Product deleted");
      router.refresh();
    } else {
      toast.error("Failed to delete product");
    }
    setDeleting(false);
    setShowConfirm(false);
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="text-sm text-red-600 hover:underline"
      >
        Delete
      </button>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Product</h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete <strong>&ldquo;{name}&rdquo;</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
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

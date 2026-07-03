"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { toast } from "sonner";

export function ContentDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);

  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);

    const res = await fetchWithCsrf(`/api/admin/content?id=${id}`, { method: "DELETE" });

    if (res.ok) {
      toast.success("Content deleted");

      router.refresh();
    } else {
      toast.error("Failed to delete content");
    }

    setDeleting(false);

    setShowConfirm(false);
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        Delete
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Delete Content
            </h3>

            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete <strong>&ldquo;{title}&rdquo;</strong>? This action
              cannot be undone.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  void handleDelete();
                }}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-red-700 disabled:opacity-50"
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

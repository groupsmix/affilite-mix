"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CategoryDeleteDialog({
  id,
  name,
  open,
  onOpenChange,
}: {
  id: string;
  name: string;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageCounts, setUsageCounts] = useState<{
    contentCount: number;
    productCount: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setUsageCounts(null);
      return;
    }
    setLoading(true);
    void fetchWithCsrf(`/api/admin/categories/usage?id=${id}`)
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { contentCount: number; productCount: number };
          setUsageCounts(data);
        }
      })
      .catch(() => {
        // fail-open: best-effort
      })
      .finally(() => setLoading(false));
  }, [open, id]);

  async function handleDelete() {
    setIsDeleting(true);
    const res = await fetchWithCsrf(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Category deleted");
      router.refresh();
      onOpenChange(false);
    } else {
      toast.error("Failed to delete category");
    }
    setIsDeleting(false);
  }

  const totalAffected = (usageCounts?.contentCount ?? 0) + (usageCounts?.productCount ?? 0);

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Category</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete <strong>&ldquo;{name}&rdquo;</strong>? This action cannot
          be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {loading && <p className="text-xs text-muted-foreground">Checking for associated records…</p>}
      {!loading && totalAffected > 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">This category has associated records:</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {(usageCounts?.contentCount ?? 0) > 0 && (
              <li>
                {usageCounts?.contentCount} content item
                {usageCounts?.contentCount !== 1 ? "s" : ""}
              </li>
            )}
            {(usageCounts?.productCount ?? 0) > 0 && (
              <li>
                {usageCounts?.productCount} product
                {usageCounts?.productCount !== 1 ? "s" : ""}
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs">
            These records will have their category set to &ldquo;None&rdquo; after deletion.
          </p>
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isDeleting}
          onClick={(event) => {
            event.preventDefault();
            void handleDelete();
          }}
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

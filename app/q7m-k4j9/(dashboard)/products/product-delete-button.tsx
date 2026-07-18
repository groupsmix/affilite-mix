"use client";

import { useState } from "react";
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

export function ProductDeleteDialog({
  id,
  name,
  onOpenChange,
}: {
  id: string;
  name: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const res = await fetchWithCsrf(`/api/admin/products?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Product deleted");
      router.refresh();
      onOpenChange(false);
    } else {
      toast.error("Failed to delete product");
    }
    setIsDeleting(false);
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Product</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete <strong>&ldquo;{name}&rdquo;</strong>? This action cannot
          be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
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

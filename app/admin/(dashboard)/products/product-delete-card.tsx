"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/admin/forms";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

interface ProductDeleteCardProps {
  id: string;
  name: string;
}

/**
 * Danger-zone card for the product edit page. Opens a shadcn `AlertDialog`
 * confirm (via the shared `ConfirmDialog` wrapper) before issuing the DELETE.
 */
export function ProductDeleteCard({ id, name }: ProductDeleteCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/products?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Product deleted");
        setOpen(false);
        router.push("/admin/products");
        router.refresh();
      } else {
        toast.error("Failed to delete product");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Deleting a product is permanent. References from content blocks will be cleared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          Delete product
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={
          <>
            Delete <span className="font-semibold">&ldquo;{name}&rdquo;</span>?
          </>
        }
        description="This action cannot be undone."
        destructive
        loading={deleting}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
      />
    </Card>
  );
}

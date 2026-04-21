"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/admin/forms";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

interface CategoryDeleteCardProps {
  id: string;
  name: string;
}

type UsageCounts = {
  contentCount: number;
  productCount: number;
};

/**
 * Danger-zone card for the category edit page. Opens a shadcn `AlertDialog`
 * confirm (via the shared `ConfirmDialog` wrapper) and surfaces the usage-count
 * warning fetched from `/api/admin/categories/usage`.
 */
export function CategoryDeleteCard({ id, name }: CategoryDeleteCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usage, setUsage] = useState<UsageCounts | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setUsage(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/categories/usage?id=${id}`);
      if (res.ok) {
        const data = (await res.json()) as UsageCounts;
        setUsage(data);
      }
    } catch {
      // Non-critical — dialog still works without counts
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/categories?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Category deleted");
        setOpen(false);
        router.push("/admin/categories");
        router.refresh();
      } else {
        toast.error("Failed to delete category");
      }
    } finally {
      setDeleting(false);
    }
  }

  const totalAffected = (usage?.contentCount ?? 0) + (usage?.productCount ?? 0);

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Deleting a category is permanent. Associated content and products will have their category
          cleared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => void handleOpenChange(true)}>
          Delete category
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={
          <>
            Delete <span className="font-semibold">&ldquo;{name}&rdquo;</span>?
          </>
        }
        description="This action cannot be undone."
        body={
          <div className="space-y-2 text-sm">
            {loading && <p className="text-muted-foreground">Checking for associated records…</p>}
            {!loading && totalAffected > 0 && usage && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">This category has associated records:</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {usage.contentCount > 0 && (
                    <li>
                      {usage.contentCount} content item
                      {usage.contentCount !== 1 ? "s" : ""}
                    </li>
                  )}
                  {usage.productCount > 0 && (
                    <li>
                      {usage.productCount} product
                      {usage.productCount !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-xs">
                  These records will have their category set to &ldquo;None&rdquo; after deletion.
                </p>
              </div>
            )}
          </div>
        }
        destructive
        loading={deleting}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
      />
    </Card>
  );
}

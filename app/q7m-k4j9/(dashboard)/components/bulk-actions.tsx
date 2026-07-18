"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { toast } from "sonner";

interface StatusAction {
  status: string;
  label: string;
  className: string;
}

interface CategoryOption {
  id: string;
  name: string;
  taxonomy_type: string;
}

interface CategoryAction {
  label: string;
  categories: CategoryOption[];
}

interface BulkActionsConfig {
  apiPath: string;
  entityLabel: string;
  statusActions: StatusAction[];
  categoryAction?: CategoryAction;
}

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
  config: BulkActionsConfig;
}

export function BulkActions({ selectedIds, onClear, config }: BulkActionsProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const categoryGroups = useMemo(() => {
    if (!config.categoryAction) return new Map<string, CategoryOption[]>();
    const groups = new Map<string, CategoryOption[]>();
    for (const cat of config.categoryAction.categories) {
      const list = groups.get(cat.taxonomy_type) ?? [];
      list.push(cat);
      groups.set(cat.taxonomy_type, list);
    }
    return groups;
  }, [config.categoryAction]);

  const taxonomyLabels: Record<string, string> = {
    general: "General",
    budget: "Budget",
    occasion: "Occasion",
    recipient: "Recipient",
    brand: "Brand",
  };

  const taxonomyOrder = ["general", "budget", "occasion", "recipient", "brand"];

  if (selectedIds.length === 0) return null;

  async function bulkUpdateStatus(status: string) {
    const total = selectedIds.length;

    setLoading(true);

    setProgress({ current: 0, total, label: `Updating to ${status}` });

    let failed = 0;

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total, label: `Updating to ${status}` });

      try {
        const res = await fetchWithCsrf(config.apiPath, {
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
      toast.error(`${failed} update(s) failed`);
    } else {
      toast.success(`${total} ${config.entityLabel}(s) updated to ${status}`);
    }

    setProgress({ current: 0, total: 0, label: "" });

    onClear();

    setLoading(false);

    router.refresh();
  }

  async function bulkUpdateCategory(categoryId: string) {
    const total = selectedIds.length;

    setLoading(true);

    setProgress({ current: 0, total, label: "Updating category" });

    let failed = 0;

    const payloadCategoryId = categoryId || null;

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total, label: "Updating category" });

      try {
        const res = await fetchWithCsrf(config.apiPath, {
          method: "PATCH",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ id: selectedIds[i], category_id: payloadCategoryId }),
        });

        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      toast.error(`${failed} update(s) failed`);
    } else {
      toast.success(`${total} ${config.entityLabel}(s) assigned to category`);
    }

    setProgress({ current: 0, total: 0, label: "" });

    setSelectedCategoryId("");

    onClear();

    setLoading(false);

    router.refresh();
  }

  async function bulkDelete() {
    const total = selectedIds.length;

    setLoading(true);

    setProgress({ current: 0, total, label: "Deleting" });

    let failed = 0;

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total, label: "Deleting" });

      try {
        const res = await fetchWithCsrf(`${config.apiPath}?id=${selectedIds[i]}`, {
          method: "DELETE",
        });

        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      toast.error(`${failed} deletion(s) failed`);
    } else {
      toast.success(`${total} ${config.entityLabel}(s) deleted`);
    }

    setProgress({ current: 0, total: 0, label: "" });

    onClear();

    setLoading(false);

    router.refresh();
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 px-4 py-2">
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {loading && progress.total > 0
            ? `${progress.label} ${progress.current} of ${progress.total}…`
            : `${selectedIds.length} selected`}
        </span>

        {config.statusActions.map((action) => (
          <button
            key={action.status}
            onClick={() => {
              void bulkUpdateStatus(action.status);
            }}
            disabled={loading}
            className={action.className}
          >
            {action.label}
          </button>
        ))}

        {config.categoryAction && categoryGroups.size > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={loading}
              aria-label="Category"
              className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="">No category</option>
              {taxonomyOrder.map((type) => {
                const group = categoryGroups.get(type);
                if (!group || group.length === 0) return null;
                return (
                  <optgroup key={type} label={taxonomyLabels[type] ?? type}>
                    {group.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <button
              onClick={() => {
                void bulkUpdateCategory(selectedCategoryId);
              }}
              disabled={loading}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {config.categoryAction.label}
            </button>
          </span>
        )}

        {confirmDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              Delete {selectedIds.length} {config.entityLabel}(s)?
            </span>

            <button
              onClick={() => {
                setConfirmDelete(false);
                void bulkDelete();
              }}
              disabled={loading}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-red-700 disabled:opacity-50"
            >
              Confirm
            </button>

            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={loading}
            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}

        <button onClick={onClear} className="ml-auto text-xs text-blue-600 hover:underline">
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

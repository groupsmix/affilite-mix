"use client";

import { BulkActions } from "../components/bulk-actions";

interface ContentBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function ContentBulkActions({ selectedIds, onClear }: ContentBulkActionsProps) {
  return (
    <BulkActions
      selectedIds={selectedIds}
      onClear={onClear}
      config={{
        apiPath: "/api/admin/content",
        entityLabel: "item",
        statusActions: [
          {
            status: "published",
            label: "Publish",
            className:
              "rounded bg-green-600 px-3 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-green-700 disabled:opacity-50",
          },
          {
            status: "draft",
            label: "Set Draft",
            className:
              "rounded bg-yellow-500 px-3 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-yellow-600 disabled:opacity-50",
          },
          {
            status: "archived",
            label: "Archive",
            className:
              "rounded bg-gray-500 px-3 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-600 disabled:opacity-50",
          },
        ],
      }}
    />
  );
}

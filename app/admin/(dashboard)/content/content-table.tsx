"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, CalendarClockIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { ContentBulkActions } from "./bulk-actions";
import { ContentDeleteButton } from "./content-delete-button";

export interface ContentTableRow {
  id: string;
  title: string;
  type: string;
  status: "draft" | "review" | "published" | "scheduled" | "archived";
  author: string | null;
  publish_at: string | null;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Archived", value: "archived" },
];

const TYPE_OPTIONS = [
  { label: "Article", value: "article" },
  { label: "Review", value: "review" },
  { label: "Comparison", value: "comparison" },
  { label: "Guide", value: "guide" },
  { label: "Blog", value: "blog" },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  published: "bg-green-100 text-green-700 hover:bg-green-100",
  draft: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  review: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  scheduled: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  archived: "bg-gray-100 text-gray-600 hover:bg-gray-100",
};

const STATUS_FALLBACK_CLASS = "";

function formatPublishAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RowActions({ row }: { row: ContentTableRow }) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);

  async function handleClone() {
    setCloning(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/content/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (res.ok) {
        toast.success(`Cloned "${row.title}"`);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to clone");
      }
    } catch {
      toast.error("Failed to clone content");
    } finally {
      setCloning(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Row actions">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/content/${row.id}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            if (!cloning) void handleClone();
          }}
          disabled={cloning}
        >
          {cloning ? "Duplicating…" : "Duplicate"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild variant="destructive">
          <div className="flex w-full" onClick={(event) => event.stopPropagation()}>
            <ContentDeleteButton id={row.id} title={row.title} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const columns: ColumnDef<ContentTableRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/admin/content/${r.id}`}
                className="block max-w-[260px] truncate font-medium text-foreground hover:underline"
              >
                {r.title}
              </Link>
            </TooltipTrigger>
            <TooltipContent>{r.title}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.type}
      </Badge>
    ),
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.type) : true,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.status}
        colorMap={STATUS_BADGE_CLASSES}
        fallbackClassName={STATUS_FALLBACK_CLASS}
      />
    ),
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.status) : true,
  },
  {
    accessorKey: "author",
    header: "Author",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.author ?? "—"}</span>,
  },
  {
    accessorKey: "publish_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Publish at" />,
    cell: ({ row }) => {
      const value = row.original.publish_at;
      const isScheduled = row.original.status === "scheduled" && value;
      return (
        <span
          className={`inline-flex items-center gap-1 text-sm ${
            isScheduled ? "text-indigo-600" : "text-muted-foreground"
          }`}
        >
          {isScheduled && <CalendarClockIcon className="size-3.5" />}
          {formatPublishAt(value)}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
];

interface ContentTableProps {
  data: ContentTableRow[];
  totalCount: number;
  scheduledCount: number;
  pageSize: number;
}

export function ContentTable({ data, totalCount, scheduledCount, pageSize }: ContentTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      manualPagination
      manualSorting
      manualFiltering
      enableRowSelection
      searchPlaceholder="Search title…"
      toolbar={(table) => {
        const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);
        const statusColumn = table.getColumn("status");
        const typeColumn = table.getColumn("type");
        return (
          <>
            {statusColumn && (
              <DataTableFacetedFilter
                column={statusColumn}
                title="Status"
                options={STATUS_OPTIONS}
              />
            )}
            {typeColumn && (
              <DataTableFacetedFilter column={typeColumn} title="Type" options={TYPE_OPTIONS} />
            )}
            {scheduledCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100"
              >
                <CalendarClockIcon className="size-3.5" />
                Scheduled ({scheduledCount})
              </Badge>
            )}
            {selectedIds.length > 0 && (
              <div className="basis-full pt-2">
                <ContentBulkActions
                  selectedIds={selectedIds}
                  onClear={() => table.resetRowSelection()}
                />
              </div>
            )}
          </>
        );
      }}
    />
  );
}

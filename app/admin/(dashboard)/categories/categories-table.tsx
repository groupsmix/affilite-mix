"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { CategoryDeleteButton } from "./category-delete-button";

export const CATEGORIES_TABLE_PAGE_SIZE = 50;

export type CategoryTaxonomyType = "general" | "budget" | "occasion" | "recipient" | "brand";

export interface CategoriesTableRow {
  id: string;
  name: string;
  slug: string;
  taxonomy_type: CategoryTaxonomyType | string;
  content_count: number;
  created_at: string;
}

const TAXONOMY_OPTIONS: { label: string; value: CategoryTaxonomyType }[] = [
  { label: "General", value: "general" },
  { label: "Budget", value: "budget" },
  { label: "Occasion", value: "occasion" },
  { label: "Recipient", value: "recipient" },
  { label: "Brand", value: "brand" },
];

/** Format an ISO timestamp as a short relative string (e.g. "3d ago"). */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function formatAbsoluteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RowActions({ row }: { row: CategoriesTableRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Row actions">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/categories/${row.id}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild variant="destructive">
          <div className="flex w-full" onClick={(event) => event.stopPropagation()}>
            <CategoryDeleteButton id={row.id} name={row.name} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const categoriesTableColumns: ColumnDef<CategoriesTableRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <Link
          href={`/admin/categories/${r.id}`}
          className="block max-w-[260px] truncate font-medium text-foreground hover:underline"
        >
          {r.name}
        </Link>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: "slug",
    header: "Slug",
    enableSorting: false,
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        {row.original.slug}
      </code>
    ),
  },
  {
    accessorKey: "taxonomy_type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.taxonomy_type}
      </Badge>
    ),
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.taxonomy_type) : true,
    enableSorting: false,
  },
  {
    accessorKey: "content_count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Content count" />,
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">{row.original.content_count}</span>
    ),
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
    cell: ({ row }) => {
      const value = row.original.created_at;
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-muted-foreground">
                {formatRelativeTime(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatAbsoluteDate(value)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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

export interface CategoriesTableProps {
  data: CategoriesTableRow[];
  totalCount: number;
  /**
   * When true and data is empty, the table is hidden and an empty-state Card
   * with a CTA to create a first category is shown instead.
   *
   * When false and data is empty (e.g. a search returned no matches), the
   * table renders with its built-in "No results." row so the toolbar and
   * active filters remain visible.
   */
  hasAnyFilter?: boolean;
  /** Override the default 50-per-page. Primarily for tests. */
  pageSize?: number;
}

/**
 * Client component that renders the admin categories list via the shared
 * `<DataTable>`.
 *
 * Designed for server-side paging/sorting/filtering: the parent page reads
 * `q`, `sort`, `f.taxonomy_type`, `page`, and `size` from `searchParams`,
 * queries the DAL, and passes the current page as `data` plus the total
 * (post-filter) count as `totalCount`.
 */
export function CategoriesTable({
  data,
  totalCount,
  hasAnyFilter = false,
  pageSize = CATEGORIES_TABLE_PAGE_SIZE,
}: CategoriesTableProps) {
  if (data.length === 0 && !hasAnyFilter) {
    return <CategoriesEmptyState />;
  }

  return (
    <DataTable
      columns={categoriesTableColumns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      manualPagination
      manualSorting
      manualFiltering
      searchPlaceholder="Search categories…"
      toolbar={(table) => {
        const taxonomyColumn = table.getColumn("taxonomy_type");
        if (!taxonomyColumn) return null;
        return (
          <DataTableFacetedFilter column={taxonomyColumn} title="Type" options={TAXONOMY_OPTIONS} />
        );
      }}
    />
  );
}

/** Empty state shown when the site has no categories at all. */
export function CategoriesEmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="text-muted-foreground">No categories yet.</p>
        <Link
          href="/admin/categories/new"
          className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Create your first category
        </Link>
      </CardContent>
    </Card>
  );
}

"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import type { AffiliateClickRow } from "@/types/database";

import { LocalTime } from "./local-time";

/**
 * Row shape rendered by the Recent Clicks table. Widened from
 * `AffiliateClickRow` so an optional `country` column surfaces automatically
 * once the underlying DAL/schema start returning it.
 */
export type RecentClickRow = AffiliateClickRow & {
  country?: string | null;
};

interface RecentClicksTableProps {
  data: RecentClickRow[];
}

const columns: ColumnDef<RecentClickRow>[] = [
  {
    accessorKey: "created_at",
    header: "Time",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        <LocalTime dateTime={row.original.created_at} />
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "referrer",
    header: "Referrer",
    cell: ({ row }) => (
      <span
        className="block max-w-[240px] truncate text-muted-foreground"
        title={row.original.referrer || undefined}
      >
        {row.original.referrer || "\u2014"}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "content_slug",
    header: "Content",
    cell: ({ row }) => (
      <span
        className="block max-w-[240px] truncate text-muted-foreground"
        title={row.original.content_slug || undefined}
      >
        {row.original.content_slug || "\u2014"}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "product_name",
    header: "Product",
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.original.product_name}</span>
    ),
    enableSorting: false,
  },
];

const columnsWithCountry: ColumnDef<RecentClickRow>[] = [
  ...columns,
  {
    accessorKey: "country",
    header: "Country",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.country || "\u2014"}</span>
    ),
    enableSorting: false,
  },
];

/**
 * Recent affiliate clicks table, rendered with the shared `<DataTable>`.
 *
 * The caller is expected to apply a server-side row cutoff (e.g. the 20 most
 * recent clicks); pagination is suppressed so no new paging UI is introduced.
 * A `country` column is shown only when at least one row carries that field.
 */
export function RecentClicksTable({ data }: RecentClicksTableProps) {
  const hasCountry = data.some((row) => row.country != null && row.country !== "");
  const cols = hasCountry ? columnsWithCountry : columns;

  return (
    <DataTable
      columns={cols}
      data={data}
      totalCount={data.length}
      pageSize={Math.max(data.length, 1)}
      hideToolbar
      hidePagination
    />
  );
}

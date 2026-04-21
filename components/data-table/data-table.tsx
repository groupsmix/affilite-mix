// Adapted from https://github.com/openstatusHQ/data-table-filters (MIT).
"use client";

import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { useDataTableUrlState } from "./use-data-table-url-state";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalCount: number;
  pageSize?: number;
  searchParamPrefix?: string;
  toolbar?: (table: import("@tanstack/react-table").Table<TData>) => React.ReactNode;
  /**
   * When true, pagination/sorting/filtering are driven by the server. The
   * `data` prop is expected to already be the current page's rows, and URL
   * state changes should trigger a re-fetch upstream (via searchParams).
   * Defaults to false (fully client-side).
   */
  manualPagination?: boolean;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  /** Enable row selection (checkbox column). */
  enableRowSelection?: boolean;
  /** Placeholder for the toolbar search input. */
  searchPlaceholder?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  totalCount,
  pageSize: defaultPageSize = 20,
  searchParamPrefix = "",
  toolbar,
  manualPagination = false,
  manualSorting = false,
  manualFiltering = false,
  enableRowSelection = false,
  searchPlaceholder,
}: DataTableProps<TData, TValue>) {
  const {
    search,
    onSearchChange,
    sorting,
    onSortingChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
  } = useDataTableUrlState({
    prefix: searchParamPrefix,
    defaultPageSize,
  });

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    rowCount: totalCount,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
      rowSelection,
    },
    onSortingChange: onSortingChange as (
      updater: SortingState | ((old: SortingState) => SortingState),
    ) => void,
    onColumnFiltersChange: onColumnFiltersChange as (
      updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState),
    ) => void,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: onPaginationChange as (
      updater: PaginationState | ((old: PaginationState) => PaginationState),
    ) => void,
    onRowSelectionChange: setRowSelection,
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination,
    manualSorting,
    manualFiltering,
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
      >
        {toolbar?.(table)}
      </DataTableToolbar>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

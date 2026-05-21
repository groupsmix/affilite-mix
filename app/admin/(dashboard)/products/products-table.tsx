"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  LinkIcon,
  MoreHorizontalIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { BulkActions } from "./bulk-actions";
import { ProductDeleteButton } from "./product-delete-button";

export interface ProductsTableRow {
  id: string;
  name: string;
  image_url: string | null;
  image_alt: string | null;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  category_name: string | null;
  merchant: string | null;
  price: string | null;
  price_amount: number | null;
  price_currency: string | null;
  /** Null when the product has no per-product EPC value. */
  epc: number | null;
  affiliate_url: string | null;
}

interface ProductsTableProps {
  data: ProductsTableRow[];
  totalCount: number;
  pageSize: number;
  statusOptions: { label: string; value: string }[];
  categoryOptions: { label: string; value: string }[];
  networkOptions: { label: string; value: string }[];
  /** Whether the missing-URL quick filter is currently active. */
  missingUrlActive: boolean;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: "bg-green-100 text-green-700 hover:bg-green-100",
  draft: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  archived: "bg-gray-100 text-gray-600 hover:bg-gray-100",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function formatPrice(row: ProductsTableRow): string {
  if (row.price_amount != null) {
    const amount = row.price_amount;
    const currency = row.price_currency || "USD";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }
  return row.price?.trim() || "—";
}

function ProductThumbnail({ row }: { row: ProductsTableRow }) {
  const alt = row.image_alt?.trim() || row.name;
  if (row.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={row.image_url}
        alt={alt}
        width={32}
        height={32}
        loading="lazy"
        className="size-8 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
      {initialsFromName(row.name)}
    </div>
  );
}

function AffiliateUrlIcon({ row }: { row: ProductsTableRow }) {
  const hasUrl = Boolean(row.affiliate_url && row.affiliate_url.trim().length > 0);
  if (hasUrl) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center text-green-600"
              aria-label="Affiliate URL present"
            >
              <CheckCircle2Icon className="size-4" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Affiliate URL set</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center text-red-600"
            aria-label="Missing affiliate URL"
          >
            <AlertCircleIcon className="size-4" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Missing affiliate URL</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RowActions({ row }: { row: ProductsTableRow }) {
  async function handleCopy() {
    if (!row.affiliate_url) {
      toast.error("No affiliate URL to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(row.affiliate_url);
      toast.success("Affiliate URL copied");
    } catch {
      toast.error("Failed to copy affiliate URL");
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
          <Link href={`/admin/products/${row.id}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleCopy();
          }}
          disabled={!row.affiliate_url}
        >
          <CopyIcon className="size-4" />
          Copy affiliate URL
        </DropdownMenuItem>
        <DropdownMenuItem asChild variant="destructive">
          <div className="flex w-full" onClick={(event) => event.stopPropagation()}>
            <ProductDeleteButton id={row.id} name={row.name} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const columns: ColumnDef<ProductsTableRow>[] = [
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
    id: "image",
    header: () => <span className="sr-only">Image</span>,
    cell: ({ row }) => <ProductThumbnail row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link
        href={`/admin/products/${row.original.id}`}
        className="block max-w-[260px] truncate font-medium text-foreground hover:underline"
      >
        {row.original.name}
      </Link>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "category_id",
    header: "Category",
    cell: ({ row }) => {
      const name = row.original.category_name;
      if (!name) return <span className="text-muted-foreground">—</span>;
      return (
        <Badge variant="outline" className="capitalize">
          {name}
        </Badge>
      );
    },
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0
        ? value.includes(row.original.category_id ?? "")
        : true,
    enableSorting: false,
  },
  {
    accessorKey: "merchant",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Network" />,
    cell: ({ row }) => {
      const merchant = row.original.merchant?.trim();
      if (!merchant) return <span className="text-muted-foreground">—</span>;
      return <Badge variant="secondary">{merchant}</Badge>;
    },
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.merchant ?? "") : true,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} colorMap={STATUS_BADGE_CLASSES} />,
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.status) : true,
  },
  {
    accessorKey: "price_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
    cell: ({ row }) => <span className="tabular-nums">{formatPrice(row.original)}</span>,
  },
  {
    accessorKey: "epc",
    header: ({ column }) => <DataTableColumnHeader column={column} title="EPC" />,
    cell: ({ row }) => {
      const epc = row.original.epc;
      if (epc == null) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="tabular-nums">
          {new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 3,
          }).format(epc)}
        </span>
      );
    },
  },
  {
    id: "affiliate_url",
    header: () => (
      <span className="inline-flex items-center gap-1">
        <LinkIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Affiliate URL</span>
      </span>
    ),
    cell: ({ row }) => <AffiliateUrlIcon row={row.original} />,
    enableSorting: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
];

function MissingUrlPill({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete("missing_url");
    } else {
      params.set("missing_url", "1");
    }
    // Always reset to first page when toggling the quick filter.
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className={`h-8 border-dashed ${
        active ? "bg-red-600 text-white hover:bg-red-700" : "text-red-700 hover:bg-red-50"
      }`}
      onClick={toggle}
      aria-pressed={active}
    >
      <AlertCircleIcon className="size-3.5" aria-hidden="true" />
      Missing affiliate URL
      {active && <XIcon className="size-3.5" aria-hidden="true" />}
    </Button>
  );
}

export function ProductsTable({
  data,
  totalCount,
  pageSize,
  statusOptions,
  categoryOptions,
  networkOptions,
  missingUrlActive,
}: ProductsTableProps) {
  const memoColumns = useMemo(() => columns, []);

  return (
    <DataTable
      columns={memoColumns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      manualPagination
      manualSorting
      manualFiltering
      enableRowSelection
      searchPlaceholder="Search products by name…"
      toolbar={(table) => {
        const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);
        const statusColumn = table.getColumn("status");
        const categoryColumn = table.getColumn("category_id");
        const networkColumn = table.getColumn("merchant");
        return (
          <>
            {statusColumn && (
              <DataTableFacetedFilter
                column={statusColumn}
                title="Status"
                options={statusOptions}
              />
            )}
            {categoryColumn && categoryOptions.length > 0 && (
              <DataTableFacetedFilter
                column={categoryColumn}
                title="Category"
                options={categoryOptions}
              />
            )}
            {networkColumn && networkOptions.length > 0 && (
              <DataTableFacetedFilter
                column={networkColumn}
                title="Network"
                options={networkOptions}
              />
            )}
            <MissingUrlPill active={missingUrlActive} />
            {selectedIds.length > 0 && (
              <div className="basis-full pt-2">
                <BulkActions selectedIds={selectedIds} onClear={() => table.resetRowSelection()} />
              </div>
            )}
          </>
        );
      }}
    />
  );
}

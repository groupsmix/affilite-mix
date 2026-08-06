"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CodeIcon,
  GlobeIcon,
  HeartIcon,
  ImageIcon,
  LeafIcon,
  MoreHorizontalIcon,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { cn } from "@/lib/utils";
import type { AdPlacementRow, AdPlacementType, AdProvider } from "@/types/database";

import { NewAdPlacementDialog } from "./new-ad-placement-dialog";

/**
 * Row shape passed from the server page into the client table. Extends the
 * DAL's `AdPlacementRow` and adds the derived columns the server computes from
 * `getAdImpressionStats` + the relocated CPM map: `impressions_30d`,
 * `est_revenue_30d`, `cpm`, and `cpm_is_override`.
 *
 * Note: Task 14b's brief referenced a schema with `slot` and `placement_key`
 * columns; the real `ad_placements` table (migration 00015) uses
 * `placement_type` + `name` instead. We surface those under the brief's
 * column labels ("Slot" / "Key") so the UI matches the task description
 * without adding a new migration.
 */
export interface AdsTableRow extends AdPlacementRow {
  impressions_30d: number;
  est_revenue_30d: number;
  cpm: number;
  /** True when `config.est_cpm` overrides the provider default. */
  cpm_is_override: boolean;
}

export const ADS_TABLE_PAGE_SIZE = 50;

const PROVIDER_META: Record<AdProvider, { label: string; icon: LucideIcon; className: string }> = {
  image: {
    label: "Image / banner",
    icon: ImageIcon,
    className: "bg-amber-100 text-amber-700 dark:text-amber-300 hover:bg-amber-100",
  },
  adsense: {
    label: "Google AdSense",
    icon: GlobeIcon,
    className: "bg-blue-100 text-blue-700 dark:text-blue-300 hover:bg-blue-100",
  },
  carbon: {
    label: "Carbon Ads",
    icon: LeafIcon,
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  ethicalads: {
    label: "EthicalAds",
    icon: HeartIcon,
    className: "bg-brand-100 text-brand-700 hover:bg-brand-100",
  },
  custom: {
    label: "Custom",
    icon: CodeIcon,
    className: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  },
};

const SLOT_LABELS: Record<AdPlacementType, string> = {
  header: "Header",
  sidebar: "Sidebar",
  in_content: "In-article",
  footer: "Footer",
  between_posts: "Between posts",
};

const SLOT_CLASSES: Record<AdPlacementType, string> = {
  header: "bg-blue-100 text-blue-700 dark:text-blue-300 hover:bg-blue-100",
  sidebar: "bg-brand-100 text-brand-700 hover:bg-brand-100",
  in_content: "bg-green-100 text-green-700 dark:text-green-300 hover:bg-green-100",
  footer: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100",
  between_posts: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function ProviderCell({ provider }: { provider: AdProvider }) {
  const meta = PROVIDER_META[provider];
  const Icon = meta.icon;
  return (
    <Badge className={cn("gap-1.5 font-normal", meta.className)}>
      <Icon className="size-3.5" aria-hidden />
      <span>{meta.label}</span>
    </Badge>
  );
}

function SlotCell({ type }: { type: AdPlacementType }) {
  const label = SLOT_LABELS[type];
  const className = SLOT_CLASSES[type];
  return <Badge className={cn("font-normal", className)}>{label}</Badge>;
}

function KeyCell({ value }: { value: string }) {
  return (
    <code className="max-w-[240px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {value}
    </code>
  );
}

function CpmCell({ value, isOverride }: { value: number; isOverride: boolean }) {
  const formatted = formatUsd(value);
  if (!isOverride) {
    return <span className="tabular-nums text-muted-foreground">{formatted}</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
            {formatted}
            <Badge variant="outline" className="h-5 px-1 text-[10px] font-medium uppercase">
              Override
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          Overrides the provider default via <code className="font-mono">config.est_cpm</code>.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusCell({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="bg-green-100 text-green-700 dark:text-green-300 hover:bg-green-100">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

function AdRowActions({ ad }: { ad: AdsTableRow }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this ad placement?")) return;
    const res = await fetchWithCsrf(`/api/admin/ads/${ad.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Ad placement deleted");
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Failed to delete ad placement");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Row actions">
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void handleDelete()}
            className="text-destructive focus:text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewAdPlacementDialog ad={ad} open={editOpen} onOpenChange={setEditOpen}>
        {null}
      </NewAdPlacementDialog>
    </>
  );
}

const adsTableColumns: ColumnDef<AdsTableRow>[] = [
  {
    accessorKey: "provider",
    header: "Provider",
    cell: ({ row }) => <ProviderCell provider={row.original.provider} />,
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: "placement_type",
    header: "Slot",
    cell: ({ row }) => <SlotCell type={row.original.placement_type} />,
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "Key",
    cell: ({ row }) => <KeyCell value={row.original.name} />,
    enableSorting: false,
  },
  {
    accessorKey: "impressions_30d",
    header: () => <span className="block text-right">Impressions (30d)</span>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-foreground">
        {row.original.impressions_30d.toLocaleString()}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "est_revenue_30d",
    header: () => <span className="block text-right">Est. revenue (30d)</span>,
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums text-green-700 dark:text-green-300">
        {formatUsd(row.original.est_revenue_30d)}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "cpm",
    header: () => <span className="block text-right">CPM</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <CpmCell value={row.original.cpm} isOverride={row.original.cpm_is_override} />
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => <StatusCell isActive={row.original.is_active} />,
    enableSorting: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <AdRowActions ad={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
];

export interface AdsTableProps {
  data: AdsTableRow[];
  totalCount: number;
  /**
   * When true and data is empty, render an empty-state Card with a hint
   * about creating the first placement via the page-header button.
   */
  showEmptyState?: boolean;
  pageSize?: number;
}

/**
 * Client component that renders the admin ad placements list via the shared
 * `<DataTable>`.
 *
 * Task 14b scope: columns only. Filters, search, sort, URL sync, and row
 * actions are deferred to later tasks; the read-only toolbar is hidden.
 */
export function AdsTable({
  data,
  totalCount,
  showEmptyState = false,
  pageSize = ADS_TABLE_PAGE_SIZE,
}: AdsTableProps) {
  if (data.length === 0 && showEmptyState) {
    return <AdsEmptyState />;
  }

  return (
    <DataTable
      columns={adsTableColumns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      hideToolbar
    />
  );
}

function AdsEmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="text-muted-foreground">No ad placements configured yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Use <span className="font-medium text-foreground">Add placement</span> above to create
          your first one.
        </p>
      </CardContent>
    </Card>
  );
}

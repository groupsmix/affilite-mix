"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, EyeIcon, XIcon } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface AuditLogTableRow {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip: string;
  details: Record<string, unknown>;
}

interface AuditLogTableProps {
  data: AuditLogTableRow[];
  totalCount: number;
  pageSize: number;
  actionOptions: { label: string; value: string }[];
  entityTypeOptions: { label: string; value: string }[];
}

/**
 * Color palette for action badges. Common action names are color-coded;
 * everything else falls back to a neutral slate tone. Colors are paired
 * with the plain-text action name so colorblind users are not excluded.
 */
const ACTION_BADGE_CLASSES: Record<string, string> = {
  create: "bg-green-100 text-green-700 hover:bg-green-100",
  created: "bg-green-100 text-green-700 hover:bg-green-100",
  update: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  updated: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  delete: "bg-red-100 text-red-700 hover:bg-red-100",
  deleted: "bg-red-100 text-red-700 hover:bg-red-100",
  login: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  logout: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  error: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  failed: "bg-orange-100 text-orange-700 hover:bg-orange-100",
};

function actionBadgeClass(action: string): string {
  const key = action.toLowerCase();
  // Try whole-name match first, then fall back to prefix matches so
  // variants like `content.created` / `product.deleted` still light up.
  if (ACTION_BADGE_CLASSES[key]) return ACTION_BADGE_CLASSES[key];
  for (const [name, cls] of Object.entries(ACTION_BADGE_CLASSES)) {
    if (key.includes(name)) return cls;
  }
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return sec <= 1 ? "just now" : `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

function shortId(id: string | null): string {
  if (!id) return "";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function WhenCell({ iso }: { iso: string }) {
  // Relative time refreshes every minute so the grid doesn't go stale on
  // long-lived tabs. The ISO timestamp is the tooltip / accessible name.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <time dateTime={iso} className="whitespace-nowrap text-sm text-muted-foreground">
            {formatRelative(iso)}
          </time>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="font-mono text-xs">{iso}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge variant="secondary" className={`capitalize ${actionBadgeClass(action)}`}>
      {action}
    </Badge>
  );
}

function EntityCell({ row }: { row: AuditLogTableRow }) {
  const short = shortId(row.entity_id);
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="capitalize">
        {row.entity_type || "—"}
      </Badge>
      {short && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs text-muted-foreground">{short}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="font-mono text-xs">{row.entity_id}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}

function DetailsDialog({ row }: { row: AuditLogTableRow }) {
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(row.details ?? {}, null, 2);
    } catch {
      return String(row.details);
    }
  }, [row.details]);

  const hasDetails = pretty && pretty !== "{}";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!hasDetails}>
          <EyeIcon className="size-3.5" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit event details</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{row.action}</span> on{" "}
            <span className="font-medium">{row.entity_type}</span>
            {row.entity_id ? (
              <>
                {" "}
                <span className="font-mono text-xs">#{row.entity_id}</span>
              </>
            ) : null}{" "}
            by <span className="font-medium">{row.actor}</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/30">
          <pre className="p-4 font-mono text-xs whitespace-pre-wrap break-words">{pretty}</pre>
        </ScrollArea>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

const columns: ColumnDef<AuditLogTableRow>[] = [
  {
    accessorKey: "created_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ row }) => <WhenCell iso={row.original.created_at} />,
  },
  {
    accessorKey: "actor",
    header: "Actor",
    cell: ({ row }) => {
      const actor = row.original.actor || "—";
      return (
        <span className="max-w-[220px] truncate text-sm text-foreground" title={actor}>
          {actor}
        </span>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => <ActionBadge action={row.original.action} />,
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.action) : true,
    enableSorting: false,
  },
  {
    accessorKey: "entity_type",
    header: "Entity",
    cell: ({ row }) => <EntityCell row={row.original} />,
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.length > 0 ? value.includes(row.original.entity_type) : true,
    enableSorting: false,
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.ip || "—"}</span>
    ),
    enableSorting: false,
  },
  {
    id: "details",
    header: () => <span className="sr-only">Details</span>,
    cell: ({ row }) => <DetailsDialog row={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
];

/**
 * Popover-based date range picker. Uses two native `<input type="date">`
 * (deliberately — see PR description: we can upgrade to a real shadcn
 * Calendar component in a follow-up without changing the URL contract).
 */
function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";

  const [open, setOpen] = useState(false);
  const [fromValue, setFromValue] = useState(fromParam ? fromParam.slice(0, 10) : "");
  const [toValue, setToValue] = useState(toParam ? toParam.slice(0, 10) : "");

  useEffect(() => {
    setFromValue(fromParam ? fromParam.slice(0, 10) : "");
    setToValue(toParam ? toParam.slice(0, 10) : "");
  }, [fromParam, toParam]);

  const apply = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (fromValue) {
      params.set("from", new Date(`${fromValue}T00:00:00.000Z`).toISOString());
    } else {
      params.delete("from");
    }
    if (toValue) {
      params.set("to", new Date(`${toValue}T23:59:59.999Z`).toISOString());
    } else {
      params.delete("to");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
    setOpen(false);
  }, [fromValue, toValue, router, searchParams]);

  const clear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
    setFromValue("");
    setToValue("");
  }, [router, searchParams]);

  const hasRange = Boolean(fromParam || toParam);
  const label = hasRange ? `${fromValue || "…"} → ${toValue || "…"}` : "Last 48 hours";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <CalendarIcon className="mr-2 size-4" />
          {label}
          {hasRange && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date range"
              className="ml-2 inline-flex items-center rounded-sm text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  clear();
                }
              }}
            >
              <XIcon className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto" align="start">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            From
            <input
              type="date"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            To
            <input
              type="date"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
            <Button size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AuditLogTable({
  data,
  totalCount,
  pageSize,
  actionOptions,
  entityTypeOptions,
}: AuditLogTableProps) {
  // Keep a stable ref to the last DataTable toolbar so we can hoist the
  // date-range filter alongside the faceted filters.
  const containerRef = useRef<HTMLDivElement>(null);
  void containerRef;

  return (
    <DataTable
      columns={columns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      manualPagination
      manualSorting
      manualFiltering
      searchPlaceholder="Search actor or entity id…"
      toolbar={(table) => {
        const actionColumn = table.getColumn("action");
        const entityColumn = table.getColumn("entity_type");
        return (
          <>
            <DateRangeFilter />
            {actionColumn && (
              <DataTableFacetedFilter
                column={actionColumn}
                title="Action"
                options={actionOptions}
              />
            )}
            {entityColumn && (
              <DataTableFacetedFilter
                column={entityColumn}
                title="Entity type"
                options={entityTypeOptions}
              />
            )}
          </>
        );
      }}
    />
  );
}

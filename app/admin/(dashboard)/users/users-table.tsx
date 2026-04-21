"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { formatRelativeTime } from "../categories/categories-table";
import { UserRowActions } from "./user-row-actions";

/**
 * Role enum values actually used in the `admin_users` table.
 *
 * Note: Task 13a's description referenced `super_admin | editor | viewer`, but
 * the database `CHECK` constraint (migration 00002) only allows
 * `admin | super_admin`. We render the real enum here; the placeholder
 * editor/viewer styles remain available for future role expansion.
 */
export type AdminUserRole = "admin" | "super_admin";

/**
 * Row shape passed from the server page into the client table. Explicitly
 * excludes `password_hash`, `reset_token`, and `reset_token_expires_at` — those
 * must never leave the server.
 *
 * `last_login_at` is intentionally nullable: the column does not exist yet on
 * `admin_users`, so it is always passed as `null` today. Wiring a real value is
 * deferred until the schema gains the column.
 */
export interface UsersTableRow {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  is_active: boolean;
  /** Slugs of sites this user has explicit membership for. Ignored for super_admin. */
  site_slugs: string[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export const USERS_TABLE_PAGE_SIZE = 20;

const ROLE_LABELS: Record<AdminUserRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
};

const ROLE_FILTER_OPTIONS: { label: string; value: AdminUserRole }[] = [
  { label: ROLE_LABELS.super_admin, value: "super_admin" },
  { label: ROLE_LABELS.admin, value: "admin" },
];

const STATUS_FILTER_OPTIONS: { label: string; value: "active" | "inactive" }[] = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/**
 * Role badge colour tokens. `editor` / `viewer` are kept as placeholders so
 * future role additions can land without another design pass (blue/gray per
 * Task 13a brief).
 */
const ROLE_BADGE_CLASSES: Record<string, string> = {
  super_admin: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  admin: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  editor: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  viewer: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

function initialsFor(nameOrEmail: string): string {
  const source = nameOrEmail.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  const first = parts[0] ?? source;
  return first.slice(0, 2).toUpperCase();
}

function AvatarEmailCell({ row }: { row: UsersTableRow }) {
  const hasName = row.name.trim().length > 0;
  const initials = initialsFor(hasName ? row.name : row.email);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar size="sm" className="shrink-0">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 leading-tight">
        {hasName ? (
          <>
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </>
        ) : (
          <p className="truncate font-medium text-foreground">{row.email}</p>
        )}
      </div>
    </div>
  );
}

function RoleBadgeCell({ role }: { role: AdminUserRole }) {
  const className = ROLE_BADGE_CLASSES[role] ?? ROLE_BADGE_CLASSES.viewer;
  const label = ROLE_LABELS[role] ?? role;
  return <Badge className={cn(className)}>{label}</Badge>;
}

function SitesAccessCell({ row }: { row: UsersTableRow }) {
  if (row.role === "super_admin") {
    return (
      <Badge variant="outline" className="font-normal">
        All sites
      </Badge>
    );
  }

  const slugs = row.site_slugs;
  if (slugs.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (slugs.length <= 3) {
    return (
      <div className="flex flex-wrap gap-1">
        {slugs.map((slug) => (
          <Badge key={slug} variant="outline" className="font-normal">
            {slug}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs font-normal">
          {slugs.length} sites
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[320px]">
        <div className="flex flex-wrap gap-1">
          {slugs.map((slug) => (
            <Badge key={slug} variant="outline" className="font-normal">
              {slug}
            </Badge>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadgeCell({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

function RelativeWithTooltipCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground">{formatRelativeTime(value)}</span>
        </TooltipTrigger>
        <TooltipContent>{new Date(value).toLocaleString()}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface RowActionsContext {
  currentUserId: string | null;
  lastActiveSuperAdminId: string | null;
}

export function buildUsersTableColumns(context: RowActionsContext): ColumnDef<UsersTableRow>[] {
  return [
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => <AvatarEmailCell row={row.original} />,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const name = row.original.name.trim();
        if (!name) return <span className="text-muted-foreground">—</span>;
        return <span className="text-foreground">{name}</span>;
      },
      enableSorting: false,
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => <RoleBadgeCell role={row.original.role} />,
      filterFn: (row, _id, value: string[]) =>
        Array.isArray(value) && value.length > 0 ? value.includes(row.original.role) : true,
    },
    {
      id: "sites",
      header: "Sites access",
      cell: ({ row }) => <SitesAccessCell row={row.original} />,
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => <StatusBadgeCell isActive={row.original.is_active} />,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        const current = row.original.is_active ? "active" : "inactive";
        return value.includes(current);
      },
      enableSorting: false,
    },
    {
      accessorKey: "last_login_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last login" />,
      cell: ({ row }) => <RelativeWithTooltipCell value={row.original.last_login_at} />,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => <RelativeWithTooltipCell value={row.original.created_at} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <UserRowActions
          user={row.original}
          currentUserId={context.currentUserId}
          isLastActiveSuperAdmin={
            context.lastActiveSuperAdminId !== null &&
            context.lastActiveSuperAdminId === row.original.id
          }
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export interface UsersTableProps {
  data: UsersTableRow[];
  totalCount: number;
  /** Id of the currently signed-in admin; used for self-action gating. */
  currentUserId: string | null;
  /**
   * When true and data is empty, the table is hidden and an empty-state Card
   * with a prompt to add the first admin user is shown instead.
   *
   * When false and data is empty (e.g. a search returned no matches), the
   * table renders with its built-in "No results." row so the toolbar and
   * active filters remain visible.
   */
  hasAnyFilter?: boolean;
  pageSize?: number;
}

/**
 * Client component rendering the admin users list via the shared
 * `<DataTable>`. Task 13b adds role/status faceted filters, debounced search
 * over email + name, sortable email/role/last_login/created_at columns, and
 * URL-synced state (via the shared `useDataTableUrlState` helper inside
 * `<DataTable>`). Task 13c wires the per-row actions dropdown (edit,
 * (de)activate, reset password, delete).
 */
export function UsersTable({
  data,
  totalCount,
  currentUserId,
  hasAnyFilter = false,
  pageSize = USERS_TABLE_PAGE_SIZE,
}: UsersTableProps) {
  const columns = useMemo(() => {
    const activeSuperAdmins = data.filter((u) => u.role === "super_admin" && u.is_active);
    const lastActiveSuperAdminId =
      activeSuperAdmins.length === 1 ? (activeSuperAdmins[0]?.id ?? null) : null;

    return buildUsersTableColumns({ currentUserId, lastActiveSuperAdminId });
  }, [data, currentUserId]);

  if (data.length === 0 && !hasAnyFilter) {
    return <UsersEmptyState />;
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      totalCount={totalCount}
      pageSize={pageSize}
      manualPagination
      manualSorting
      manualFiltering
      searchPlaceholder="Search email or name…"
      toolbar={(table) => {
        const roleColumn = table.getColumn("role");
        const statusColumn = table.getColumn("status");
        return (
          <>
            {roleColumn && (
              <DataTableFacetedFilter
                column={roleColumn}
                title="Role"
                options={ROLE_FILTER_OPTIONS}
              />
            )}
            {statusColumn && (
              <DataTableFacetedFilter
                column={statusColumn}
                title="Status"
                options={STATUS_FILTER_OPTIONS}
              />
            )}
          </>
        );
      }}
    />
  );
}

export function UsersEmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="text-muted-foreground">No admin users yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add your first admin user to enable login.
        </p>
      </CardContent>
    </Card>
  );
}

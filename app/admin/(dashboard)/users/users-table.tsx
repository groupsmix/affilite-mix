"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { formatRelativeTime } from "../categories/categories-table";

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

const ROLE_LABELS: Record<AdminUserRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
};

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

function LastLoginCell({ value }: { value: string | null }) {
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

/**
 * Placeholder dropdown trigger — real row actions land in Task 13c.
 * Rendered as a disabled-looking trigger with no menu items so the column
 * width matches the post-13c layout.
 */
function RowActionsPlaceholder() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Row actions">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">No actions yet</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const usersTableColumns: ColumnDef<UsersTableRow>[] = [
  {
    id: "user",
    accessorKey: "email",
    header: "User",
    cell: ({ row }) => <AvatarEmailCell row={row.original} />,
    enableHiding: false,
    enableSorting: false,
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
    header: "Role",
    cell: ({ row }) => <RoleBadgeCell role={row.original.role} />,
    enableSorting: false,
  },
  {
    id: "sites",
    header: "Sites access",
    cell: ({ row }) => <SitesAccessCell row={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => <StatusBadgeCell isActive={row.original.is_active} />,
    enableSorting: false,
  },
  {
    accessorKey: "last_login_at",
    header: "Last login",
    cell: ({ row }) => <LastLoginCell value={row.original.last_login_at} />,
    enableSorting: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: () => <RowActionsPlaceholder />,
    enableSorting: false,
    enableHiding: false,
  },
];

export interface UsersTableProps {
  data: UsersTableRow[];
}

/**
 * Client component rendering the admin users list via the shared
 * `<DataTable>`. Task 13a scope: read-only shell — no filters, search, sort,
 * URL sync, or row actions. Those land in 13b/13c.
 */
export function UsersTable({ data }: UsersTableProps) {
  if (data.length === 0) {
    return <UsersEmptyState />;
  }

  return (
    <DataTable
      columns={usersTableColumns}
      data={data}
      totalCount={data.length}
      pageSize={20}
      hideToolbar
    />
  );
}

function UsersEmptyState() {
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

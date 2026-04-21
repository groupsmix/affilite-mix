import type { AdminUserRole, UsersTableRow } from "./users-table";

/** Columns the UI is allowed to sort by. Must match the DataTable column ids. */
export const USERS_SORT_COLUMNS = ["email", "role", "last_login_at", "created_at"] as const;
export type UsersSortColumn = (typeof USERS_SORT_COLUMNS)[number];

/** Values accepted by the `status` facet (maps to is_active). */
export const USERS_STATUS_VALUES = ["active", "inactive"] as const;
export type UsersStatusValue = (typeof USERS_STATUS_VALUES)[number];

/** Role enum — kept in sync with AdminUserRole in users-table.tsx. */
export const USERS_ROLE_VALUES = [
  "admin",
  "super_admin",
] as const satisfies readonly AdminUserRole[];

export interface UsersQueryParams {
  q: string;
  roles: AdminUserRole[];
  statuses: UsersStatusValue[];
  sortBy: UsersSortColumn;
  sortDesc: boolean;
  page: number;
  pageSize: number;
}

export interface UsersQueryResult {
  rows: UsersTableRow[];
  totalCount: number;
}

function compareRows(a: UsersTableRow, b: UsersTableRow, sortBy: UsersSortColumn): number {
  switch (sortBy) {
    case "email":
      return a.email.localeCompare(b.email);
    case "role":
      return a.role.localeCompare(b.role);
    case "last_login_at": {
      // Nulls sort last in ascending order (most-recent-first when desc).
      const aMs = a.last_login_at ? new Date(a.last_login_at).getTime() : null;
      const bMs = b.last_login_at ? new Date(b.last_login_at).getTime() : null;
      if (aMs === null && bMs === null) return 0;
      if (aMs === null) return 1;
      if (bMs === null) return -1;
      return aMs - bMs;
    }
    case "created_at":
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }
}

/**
 * Apply search, role/status filters, sort, and pagination over the full admin
 * user list. The admin_users table is small (typically <100 rows), so this
 * runs in-memory on each page render instead of adding a server-side DAL
 * surface.
 */
export function applyUsersQuery(all: UsersTableRow[], params: UsersQueryParams): UsersQueryResult {
  const { q, roles, statuses, sortBy, sortDesc, page, pageSize } = params;

  const roleSet = new Set<AdminUserRole>(roles);
  const needle = q.trim().toLowerCase();

  let filtered = all.filter((row) => {
    if (roleSet.size > 0 && !roleSet.has(row.role)) return false;
    if (statuses.length > 0) {
      const statusValue: UsersStatusValue = row.is_active ? "active" : "inactive";
      if (!statuses.includes(statusValue)) return false;
    }
    if (needle) {
      const haystack = `${row.email} ${row.name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  // Stable secondary sort on id keeps order deterministic when primary keys
  // collide (e.g. two users with the same role or identical timestamps).
  filtered = filtered
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const cmp = compareRows(a.row, b.row, sortBy);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return a.index - b.index;
    })
    .map(({ row }) => row);

  const totalCount = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = filtered.slice(start, start + pageSize);
  return { rows, totalCount };
}

function parseCsvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed && allowedSet.has(trimmed)) out.push(trimmed as T);
  }
  return out;
}

export interface UsersSearchParamsInput {
  q?: string;
  "f.role"?: string;
  "f.status"?: string;
  sort?: string;
  page?: string;
  size?: string;
}

/** Parse the raw Next.js searchParams into a strongly-typed query object. */
export function parseUsersSearchParams(
  sp: UsersSearchParamsInput,
  defaults: { pageSize: number; sortBy: UsersSortColumn; sortDesc: boolean },
): UsersQueryParams {
  const q = (sp.q ?? "").trim();
  const roles = parseCsvEnum<AdminUserRole>(sp["f.role"], USERS_ROLE_VALUES);
  const statuses = parseCsvEnum<UsersStatusValue>(sp["f.status"], USERS_STATUS_VALUES);

  let sortBy: UsersSortColumn = defaults.sortBy;
  let sortDesc = defaults.sortDesc;
  if (sp.sort) {
    const [col, dir] = sp.sort.split(":");
    if (col && (USERS_SORT_COLUMNS as readonly string[]).includes(col)) {
      sortBy = col as UsersSortColumn;
      sortDesc = dir === "desc";
    }
  }

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(defaults.pageSize), 10);
  const pageSize = rawSize > 0 && rawSize <= 200 ? rawSize : defaults.pageSize;

  return { q, roles, statuses, sortBy, sortDesc, page: pageNum, pageSize };
}

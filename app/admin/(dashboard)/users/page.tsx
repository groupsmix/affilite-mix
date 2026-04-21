import { requireAdminSession } from "../components/admin-guard";
import { listAdminUsers } from "@/lib/dal/admin-users";
import { listAllAdminSiteMembershipsWithSlugs } from "@/lib/dal/admin-site-memberships";

import { NewUserDialog } from "./new-user-dialog";
import { USERS_TABLE_PAGE_SIZE, UsersTable, type UsersTableRow } from "./users-table";
import {
  applyUsersQuery,
  parseUsersSearchParams,
  type UsersSearchParamsInput,
} from "./users-query";

interface AdminUsersPageProps {
  searchParams: Promise<UsersSearchParamsInput>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdminSession();

  const sp = await searchParams;
  const query = parseUsersSearchParams(sp, {
    pageSize: USERS_TABLE_PAGE_SIZE,
    sortBy: "created_at",
    sortDesc: true,
  });

  const [users, memberships] = await Promise.all([
    listAdminUsers(),
    listAllAdminSiteMembershipsWithSlugs(),
  ]);

  // Bucket membership slugs by admin user id, sorted for stable rendering.
  const slugsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    if (!m.site_slug) continue;
    const arr = slugsByUser.get(m.admin_user_id) ?? [];
    arr.push(m.site_slug);
    slugsByUser.set(m.admin_user_id, arr);
  }
  for (const arr of slugsByUser.values()) arr.sort();

  // Project the DAL row to the shape the client table expects. Sensitive
  // fields (password_hash, reset_token, reset_token_expires_at) are stripped
  // here (listAdminUsers already excludes password_hash from its SELECT).
  const all: UsersTableRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    is_active: u.is_active,
    site_slugs: slugsByUser.get(u.id) ?? [],
    last_login_at: null,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));

  const { rows, totalCount } = applyUsersQuery(all, query);

  const hasAnyFilter =
    query.q.length > 0 || query.roles.length > 0 || query.statuses.length > 0 || query.page > 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who can access the admin dashboard.
          </p>
        </div>
        <NewUserDialog />
      </div>

      <UsersTable
        data={rows}
        totalCount={totalCount}
        hasAnyFilter={hasAnyFilter}
        pageSize={query.pageSize}
      />
    </div>
  );
}

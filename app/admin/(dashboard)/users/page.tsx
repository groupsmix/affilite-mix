import { requireAdminSession } from "../components/admin-guard";
import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  await requireAdminSession();

  return <UsersClient />;
}

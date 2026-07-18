import { requireAdminSession } from "../../components/admin-guard";
import { ADMIN_SITES_PATH } from "@/lib/admin-paths";
import { redirect } from "next/navigation";

export default async function ModulesPage() {
  await requireAdminSession();
  redirect(ADMIN_SITES_PATH);
}

import { requireAdminSession } from "../components/admin-guard";
import { SiteManager } from "./site-manager";

export default async function SitePickerPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-6xl">
      <SiteManager />
    </div>
  );
}

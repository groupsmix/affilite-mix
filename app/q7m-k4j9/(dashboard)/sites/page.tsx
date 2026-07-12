import { requireAdminSession } from "../components/admin-guard";
import { SiteManager } from "./site-manager";

interface SitePickerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SitePickerPage({ searchParams }: SitePickerPageProps) {
  const session = await requireAdminSession();
  const params = await searchParams;
  // ?needsSite=1 is appended by requireAdminSessionWithSite() when any
  // dashboard page redirects here because no active site is set.
  const needsSite = params.needsSite === "1";

  return (
    <div className="mx-auto max-w-6xl">
      <SiteManager needsSite={needsSite} isSuperAdmin={session.role === "super_admin"} />
    </div>
  );
}

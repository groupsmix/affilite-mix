// Settings page structure adapted from https://github.com/Qualiora/shadboard (MIT).
import { requireAdminSession } from "../components/admin-guard";
import { getAdminUserById } from "@/lib/dal/admin-users";
import { getActiveSiteSlug } from "@/lib/active-site";

import { ProfileCard } from "./_components/profile-card";
import { ChangePasswordCard } from "./_components/change-password-card";
import { ApiTokensCard } from "./_components/api-tokens-card";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireAdminSession();

  const user = session.userId ? await getAdminUserById(session.userId) : null;
  const isSuperAdmin = session.role === "super_admin";
  const activeSiteSlug = await getActiveSiteSlug();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account profile and security preferences.
        </p>
      </div>

      <ProfileCard name={user?.name ?? ""} email={user?.email ?? session.email ?? ""} />

      <ChangePasswordCard />

      {isSuperAdmin && activeSiteSlug && <ApiTokensCard />}
    </div>
  );
}

import { requireAdminSessionWithSite } from "../components/admin-guard";
import { HomepageEditor } from "./homepage-editor";

export default async function HomepagePage() {
  const session = await requireAdminSessionWithSite();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Homepage editor</h1>
      <HomepageEditor siteName={session.activeSiteName} />
    </div>
  );
}

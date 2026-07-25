import { requireAdminSessionWithSite } from "../components/admin-guard";
import { CalmConfigEditor } from "./calm-config-editor";

export default async function CalmConfigPage() {
  const session = await requireAdminSessionWithSite();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Calmroutine config editor</h1>
      <CalmConfigEditor siteName={session.activeSiteName} />
    </div>
  );
}

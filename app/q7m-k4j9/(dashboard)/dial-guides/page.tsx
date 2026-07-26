import { requireAdminSessionWithSite } from "../components/admin-guard";
import { DialGuidesEditor } from "./dial-guides-editor";

export default async function DialGuidesPage() {
  const session = await requireAdminSessionWithSite();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dial guides editor</h1>
      <DialGuidesEditor siteName={session.activeSiteName} />
    </div>
  );
}

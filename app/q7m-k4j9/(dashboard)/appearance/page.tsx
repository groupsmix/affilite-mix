import { requireAdminSessionWithSite } from "../components/admin-guard";

import { PresentationEditor } from "./presentation-editor";

export const metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requireAdminSessionWithSite();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design your site&apos;s header and footer. Changes save as a draft and go live only when
          you publish.
        </p>
      </div>

      <PresentationEditor />
    </div>
  );
}

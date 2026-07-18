import { PageManager } from "../page-manager";

export const metadata = { title: "New Page" };

export default function NewCustomPageAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Page</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create a static page for this niche site. You can also start this flow from the Pages
          list.
        </p>
      </div>
      <PageManager initialMode="create" />
    </div>
  );
}

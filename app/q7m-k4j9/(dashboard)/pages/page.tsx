import { PageManager } from "./page-manager";

export const metadata = { title: "Pages" };

export default function PagesAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Custom Pages</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create and manage static pages (About, Contact, FAQ, etc.) for this niche site.
        </p>
      </div>
      <PageManager />
    </div>
  );
}

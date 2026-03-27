import { requireAdminSession } from "../components/admin-guard";
import { listContent } from "@/lib/dal/content";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ContentList } from "./content-list";

export default async function ContentPage() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const contentItems = await listContent({ siteId: dbSiteId });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content</h1>
        <Link
          href="/admin/content/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Content
        </Link>
      </div>

      {contentItems.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No content yet.</p>
          <Link
            href="/admin/content/new"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first article
          </Link>
        </div>
      ) : (
        <ContentList items={contentItems} />
      )}
    </div>
  );
}

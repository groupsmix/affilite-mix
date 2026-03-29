import { requireAdminSession } from "../components/admin-guard";
import { listContent, countContent } from "@/lib/dal/content";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ContentList } from "./content-list";
import { Pagination } from "@/app/(public)/components/pagination";

const PAGE_SIZE = 20;

interface ContentPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const { page: pageParam, status: statusParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const statusFilter = (["draft", "review", "published", "scheduled", "archived"] as const).includes(
    statusParam as "draft" | "review" | "published" | "scheduled" | "archived",
  )
    ? (statusParam as "draft" | "review" | "published" | "scheduled" | "archived")
    : undefined;

  const [contentItems, totalContent, scheduledCount] = await Promise.all([
    listContent({ siteId: dbSiteId, status: statusFilter, limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE }),
    countContent({ siteId: dbSiteId, status: statusFilter }),
    countContent({ siteId: dbSiteId, status: "scheduled" }),
  ]);

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

      {/* Status filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: "All", value: undefined },
          { label: "Draft", value: "draft" },
          { label: "Review", value: "review" },
          { label: "Published", value: "published" },
          { label: `Scheduled (${scheduledCount})`, value: "scheduled" },
          { label: "Archived", value: "archived" },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/admin/content?status=${tab.value}` : "/admin/content"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              statusFilter === tab.value
                ? "bg-gray-900 text-white"
                : tab.value === "scheduled" && scheduledCount > 0
                  ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </Link>
        ))}
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

      <Pagination
        currentPage={currentPage}
        totalItems={totalContent}
        pageSize={PAGE_SIZE}
        basePath="/admin/content"
      />
    </div>
  );
}

import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { getCategoryById } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { requireAdminSession } from "../../components/admin-guard";
import { CategoryForm } from "../category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) notFound();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const category = await getCategoryById(dbSiteId, id);

  if (!category) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit category"
        description={`Update “${category.name}” and its taxonomy settings.`}
      />
      <CategoryForm category={category} />
    </div>
  );
}

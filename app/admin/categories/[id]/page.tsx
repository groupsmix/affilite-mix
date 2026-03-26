import { requireAdminSession } from "../../components/admin-guard";
import { getCategoryById } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { notFound } from "next/navigation";
import { CategoryForm } from "../category-form";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.siteId);
  const category = await getCategoryById(dbSiteId, id);

  if (!category) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Category</h1>
      <CategoryForm category={category} />
    </div>
  );
}

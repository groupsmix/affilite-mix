import { requireAdminSession } from "../components/admin-guard";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CategoryDeleteButton } from "./category-delete-button";

export default async function CategoriesPage() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const categories = await listCategories(dbSiteId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <Link
          href="/admin/categories/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Category
        </Link>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No categories yet.</p>
          <Link
            href="/admin/categories/new"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first category
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="px-4 py-3 font-medium text-gray-700">Slug</th>
                <th className="px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-500">{cat.slug}</td>
                  <td className="flex gap-2 px-4 py-3">
                    <Link
                      href={`/admin/categories/${cat.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <CategoryDeleteButton id={cat.id} name={cat.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

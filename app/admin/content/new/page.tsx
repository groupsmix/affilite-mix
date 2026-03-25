import { requireAdminSession } from "../../components/admin-guard";
import { listCategories } from "@/lib/dal/categories";
import { listProducts } from "@/lib/dal/products";
import { ContentForm } from "../content-form";

export default async function NewContentPage() {
  const session = await requireAdminSession();
  const [categories, products] = await Promise.all([
    listCategories(session.siteId),
    listProducts({ siteId: session.siteId }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Content</h1>
      <ContentForm categories={categories} products={products} />
    </div>
  );
}

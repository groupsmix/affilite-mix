import { requireAdminSession } from "../../components/admin-guard";
import { getContentById } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listProducts } from "@/lib/dal/products";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { notFound } from "next/navigation";
import { ContentForm } from "../content-form";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  const { id } = await params;
  const [content, categories, products, linkedProducts] = await Promise.all([
    getContentById(session.siteId, id),
    listCategories(session.siteId),
    listProducts({ siteId: session.siteId }),
    getLinkedProducts(id),
  ]);

  if (!content) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Content</h1>
      <ContentForm
        content={content}
        categories={categories}
        products={products}
        linkedProducts={linkedProducts}
      />
    </div>
  );
}

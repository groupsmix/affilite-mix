import { requireAdminSession } from "../../components/admin-guard";
import { getContentById } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listProducts } from "@/lib/dal/products";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { notFound } from "next/navigation";
import { ContentForm } from "../content-form";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) notFound();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const [content, categories, products, linkedProducts] = await Promise.all([
    getContentById(dbSiteId, id),
    listCategories(dbSiteId),
    listProducts({ siteId: dbSiteId }),
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

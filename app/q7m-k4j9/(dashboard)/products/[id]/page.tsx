import { requireAdminSession } from "../../components/admin-guard";
import { getProductById } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { notFound, redirect } from "next/navigation";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) notFound();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug).catch(() => null);
  if (!dbSiteId) redirect("/q7m-k4j9/sites?needsSite=1");
  const [product, categories] = await Promise.all([
    getProductById(dbSiteId, id),
    listCategories(dbSiteId, undefined, () => getTenantClientForSite(dbSiteId, session.userId)),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Product</h1>
      <ProductForm product={product} categories={categories} />
    </div>
  );
}

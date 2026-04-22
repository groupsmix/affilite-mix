import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { getProductById } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { requireAdminSession } from "../../components/admin-guard";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) notFound();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const [product, categories] = await Promise.all([
    getProductById(dbSiteId, id),
    listCategories(dbSiteId),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit product"
        description={`Update “${product.name}” and related media, pricing, and classification.`}
      />
      <ProductForm product={product} categories={categories} />
    </div>
  );
}

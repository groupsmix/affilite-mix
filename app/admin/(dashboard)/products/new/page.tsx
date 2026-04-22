import { PageHeader } from "@/components/admin/page-header";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { requireAdminSession } from "../../components/admin-guard";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) return null;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const categories = await listCategories(dbSiteId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New product"
        description="Add a new affiliate product, including pricing, media, and classification."
      />
      <ProductForm categories={categories} />
    </div>
  );
}

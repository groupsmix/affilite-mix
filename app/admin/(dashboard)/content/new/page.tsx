import { requireAdminSession } from "../../components/admin-guard";
import { listCategories } from "@/lib/dal/categories";
import { listProducts } from "@/lib/dal/products";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getSiteById } from "@/config/sites";
import { ContentForm } from "../content-form";

export default async function NewContentPage() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) return null;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);
  const [categories, products] = await Promise.all([
    listCategories(dbSiteId),
    listProducts({ siteId: dbSiteId }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Content</h1>
      <ContentForm categories={categories} products={products} contentTypes={getSiteById(session.activeSiteSlug!)?.contentTypes} />
    </div>
  );
}

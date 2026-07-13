import { requireAdminSession } from "../../components/admin-guard";
import { getContentById } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listProducts } from "@/lib/dal/products";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { getSiteById } from "@/config/sites";
import { notFound, redirect } from "next/navigation";
import { ContentForm } from "../content-form";

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) notFound();
  const { id } = await params;
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug).catch(() => null);
  if (!dbSiteId) redirect("/q7m-k4j9/sites?needsSite=1");
  const [content, categories, products, linkedProducts] = await Promise.all([
    getContentById(dbSiteId, id),
    listCategories(dbSiteId, undefined, () => getTenantClientForSite(dbSiteId, session.userId)),
    listProducts({ siteId: dbSiteId }),
    getLinkedProducts(dbSiteId, id),
  ]);

  if (!content) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Content</h1>
      <ContentForm
        content={content}
        categories={categories}
        products={products}
        linkedProducts={linkedProducts}
        contentTypes={getSiteById(session.activeSiteSlug!)?.contentTypes}
      />
    </div>
  );
}

import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listProducts } from "@/lib/dal/products";
import { getAnonClient } from "@/lib/supabase-server";
import type { Metadata } from "next";

export const revalidate = 60;
const PAGE_SIZE = 12;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

// TEMP DIAG: static metadata to rule out generateMetadata as the 500 source.
export async function generateMetadata(): Promise<Metadata> {
  return { title: "DIAG" };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  let stage = "start";
  try {
    const { slug } = await params;
    stage = "params:" + slug;
    const { page: pageParam } = await searchParams;
    const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
    stage = "getCurrentSite";
    const site = await getCurrentSite();
    stage = "getCategoryBySlug site=" + site.id;
    const category = await getCategoryBySlug(site.id, slug);
    if (!category) {
      return <pre style={{ padding: 20 }}>{`DIAG: no category for slug=${slug}`}</pre>;
    }
    stage = "listContent";
    const content = await listContent(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "published",
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      },
      getAnonClient,
    );
    stage = "countContent";
    const totalContent = await countContent(
      { siteId: site.id, categoryId: category.id, status: "published" },
      getAnonClient,
    );
    stage = "listProducts";
    const products = await listProducts(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "active",
        sortBy: "score",
        sortDirection: "desc",
        limit: 24,
      },
      getAnonClient,
    );
    stage = "render";
    return (
      <pre style={{ padding: 20 }}>
        {`DIAG_OK
slug=${slug}
siteId=${site.id}
category=${category.id}/${category.slug}/${category.name}
content=${content.length}
totalContent=${totalContent}
products=${products.length}`}
      </pre>
    );
  } catch (e) {
    return (
      <pre style={{ padding: 20 }} data-diag="body-error">
        {`DIAG_BODY_ERROR (stage=${stage})
${e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e)}`}
      </pre>
    );
  }
}

export async function generateStaticParams() {
  return [];
}

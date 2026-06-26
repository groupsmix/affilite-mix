import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug, listCategories } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listProducts } from "@/lib/dal/products";
import { getAnonClient } from "@/lib/supabase-server";
import { breadcrumbJsonLd } from "../../components/json-ld";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

/** Revalidate category pages every 60 seconds (ISR) */
export const revalidate = 60;

const PAGE_SIZE = 12;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/category/${category.slug}`;
  const description = `Browse ${category.name} on ${site.name}`;

  return {
    title: category.name,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: category.name,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: category.name,
      description,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const site = await getCurrentSite();
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    notFound();
  }

  const [content, totalContent, products] = await Promise.all([
    listContent(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "published",
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      },
      getAnonClient,
    ),
    countContent(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "published",
      },
      getAnonClient,
    ),
    listProducts(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "active",
        sortBy: "score",
        sortDirection: "desc",
        limit: 24,
      },
      getAnonClient,
    ),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  let bcDiag = "ok";
  try {
    breadcrumbJsonLd(site, [
      { name: site.name, path: "/" },
      { name: category.name, path: `/category/${category.slug}` },
    ]);
  } catch (e) {
    bcDiag = "THREW: " + (e instanceof Error ? `${e.message} | ${e.stack}` : String(e));
  }
  void ctaLabel;
  void locale;
  return (
    <div style={{ padding: 20 }}>
      <pre data-diag="minimal">
        {`DIAG_MINIMAL
slug=${slug}
siteId=${site.id}
category=${JSON.stringify(category).slice(0, 300)}
products=${products.length}
content=${content.length}
totalContent=${totalContent}
breadcrumbJsonLd=${bcDiag}`}
      </pre>
    </div>
  );
}

/** Pre-generate category pages at build time if categories exist */
export async function generateStaticParams() {
  try {
    const site = await getCurrentSite();
    const categories = await listCategories(site.id);
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    // fail-open: best-effort
    return [];
  }
}

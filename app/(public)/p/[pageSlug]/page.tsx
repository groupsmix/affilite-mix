import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getPageBySlug } from "@/lib/dal/pages";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface PageProps {
  params: Promise<{ pageSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { pageSlug } = await params;
  const site = await getCurrentSite();

  try {
    const siteId = await resolveDbSiteId(site.id);
    const page = await getPageBySlug(siteId, pageSlug);
    if (!page || !page.is_published) return {};

    return {
      title: `${page.title} | ${site.name}`,
    };
  } catch {
    return {};
  }
}

export default async function CustomPage({ params }: PageProps) {
  const { pageSlug } = await params;
  const site = await getCurrentSite();

  let siteId: string;
  try {
    siteId = await resolveDbSiteId(site.id);
  } catch {
    notFound();
  }

  const page = await getPageBySlug(siteId, pageSlug);
  if (!page || !page.is_published) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1
        className="mb-6 text-3xl font-bold tracking-tight"
        style={{ color: "var(--color-primary)" }}
      >
        {page.title}
      </h1>
      <div
        className="prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.body) }}
      />
    </article>
  );
}

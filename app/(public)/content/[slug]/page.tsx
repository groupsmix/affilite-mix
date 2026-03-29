import { notFound, redirect } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug } from "@/lib/dal/content";

interface ContentPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Legacy /content/[slug] route.
 * Permanently redirects to the canonical /{contentType}/[slug] URL to avoid
 * duplicate content and SEO conflicts.
 */
export default async function ContentPage({ params }: ContentPageProps) {
  const site = await getCurrentSite();
  const { slug } = await params;
  const content = await getContentBySlug(site.id, slug);

  if (!content) notFound();

  redirect(`/${content.type}/${content.slug}`);
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug, getRelatedContent } from "@/lib/dal/content";
import { getAuthorById } from "@/lib/dal/authors";
import { BlogArticle } from "../../components/blog-article";

export const revalidate = 60;

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const content = await getContentBySlug(site.id, slug);

  if (!content || content.type !== "blog") {
    return { title: "Not Found" };
  }

  const title = content.meta_title || content.title;
  const description = content.meta_description || content.excerpt || content.title;
  const url = `https://${site.domain}/blog/${content.slug}`;
  const ogImage = content.og_image || content.featured_image || undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: content.publish_at ?? content.created_at,
      modifiedTime: content.updated_at || undefined,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const content = await getContentBySlug(site.id, slug);

  if (!content || content.type !== "blog") {
    notFound();
  }

  const [relatedContent, author] = await Promise.all([
    getRelatedContent(site.id, content.category_id, content.id, 3),
    content.author_id ? getAuthorById(site.id, content.author_id) : Promise.resolve(null),
  ]);

  return (
    <BlogArticle content={content} site={site} author={author} relatedContent={relatedContent} />
  );
}

import type { AuthorRow, ContentRow } from "@/types/database";
import type { SiteDefinition } from "@/config/site-definition";
import { ArticleLayout } from "./article/article-layout";
import { ContentCardGrid } from "./content-card-grid";
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from "./json-ld";

interface BlogArticleProps {
  content: ContentRow;
  site: SiteDefinition;
  author?: AuthorRow | null;
  relatedContent?: ContentRow[];
}

export function BlogArticle({ content, site, author, relatedContent }: BlogArticleProps) {
  const displayAuthor = author
    ? { ...author, name: author.name || `${site.name} editorial team` }
    : null;

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Blog", path: "/blog" },
    { name: content.title, path: `/blog/${content.slug}` },
  ]);

  const jsonLd = articleJsonLd(site, content, displayAuthor);

  const postBody =
    relatedContent && relatedContent.length > 0 ? (
      <section className="mt-16 border-t border-border pt-10">
        <h2 className="mb-6 text-2xl font-semibold">You Might Also Like</h2>
        <ContentCardGrid items={relatedContent} locale={site.locale} />
      </section>
    ) : null;

  return (
    <ArticleLayout
      content={content}
      site={site}
      author={author}
      typeLabel="Blog"
      backHref="/blog"
      backLabel="Blog"
      body={content.body ?? ""}
      bodyIsHtml={false}
      featuredImage={content.featured_image}
      disclosure={site.affiliateDisclosure}
      jsonLd={
        <>
          <JsonLd data={breadcrumbs} />
          <JsonLd data={jsonLd} />
        </>
      }
      postBody={postBody}
    />
  );
}

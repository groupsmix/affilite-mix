import Link from "next/link";
import Image from "next/image";
import type { AuthorRow, ContentRow } from "@/types/database";
import type { SiteDefinition } from "@/config/site-definition";
import { humanizeAuthorName, stripAiDisclosure } from "@/lib/human-content";
import { HtmlRenderer } from "./html-renderer";
import { DisclosureBanner } from "./article/disclosure-banner";
import { ContentCardGrid } from "./content-card-grid";
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from "./json-ld";

interface BlogArticleProps {
  content: ContentRow;
  site: SiteDefinition;
  author?: AuthorRow | null;
  relatedContent?: ContentRow[];
}

export function BlogArticle({ content, site, author, relatedContent }: BlogArticleProps) {
  // site.locale uses OpenGraph-style underscores (e.g. en_US); Intl expects BCP 47 hyphens.
  const dateLocale = (site.locale ?? "en-US").replace(/_/g, "-");
  const updated = new Date(content.updated_at ?? content.created_at).toLocaleDateString(
    dateLocale,
    { year: "numeric", month: "long", day: "numeric" },
  );
  const published = new Date(content.publish_at ?? content.created_at).toISOString();
  const modified = new Date(content.updated_at ?? content.created_at).toISOString();

  const displayAuthorName = humanizeAuthorName(author?.name ?? content.author, site.name);
  const displayAuthor = author ? { ...author, name: displayAuthorName } : null;
  const safeExcerpt = stripAiDisclosure(content.excerpt ?? "");
  const safeBody = stripAiDisclosure(content.body ?? "");
  const initials = displayAuthorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = author?.credentials ?? `${site.name} editorial team`;

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Blog", path: "/blog" },
    { name: content.title, path: `/blog/${content.slug}` },
  ]);

  const jsonLd = articleJsonLd(site, content, displayAuthor);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={jsonLd} />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 md:pt-12">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="transition-colors hover:text-foreground">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/blog" className="transition-colors hover:text-foreground">
                Blog
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">{content.title}</li>
          </ol>
        </nav>

        <header className="mt-5">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Blog</p>
          <h1 className="mt-3 font-serif text-pretty text-4xl font-semibold leading-tight md:text-5xl">
            {content.title}
          </h1>
          {safeExcerpt && (
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              {safeExcerpt}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-secondary font-serif text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="text-sm leading-tight">
                <p className="font-medium">By {displayAuthorName}</p>
                <p className="text-muted-foreground">{role}</p>
              </div>
            </div>
            <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Updated {updated} · Hands-on tested</p>
          </div>

          <div className="mt-6">
            <DisclosureBanner />
          </div>
        </header>

        {content.featured_image && (
          <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden rounded-xl border border-border">
            <Image
              src={content.featured_image}
              alt={content.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          </div>
        )}

        <div className="mt-10">
          <HtmlRenderer html={safeBody} invert />
        </div>

        {relatedContent && relatedContent.length > 0 && (
          <section className="mt-16 border-t border-border pt-10">
            <h2 className="mb-6 font-serif text-2xl font-semibold">You Might Also Like</h2>
            <ContentCardGrid items={relatedContent} locale={site.locale} />
          </section>
        )}
      </main>
    </div>
  );
}

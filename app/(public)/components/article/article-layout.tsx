import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { ContentRow, AuthorRow, ProductRow } from "@/types/database";
import type { SiteDefinition } from "@/config/site-definition";
import { cn } from "@/lib/utils";
import { humanizeAuthorName, stripAiDisclosure } from "@/lib/human-content";
import { prepareArticleBody, estimateReadingTime } from "@/lib/article";
import { sanitizeHtmlMemoized } from "@/lib/sanitize-html";
import { Breadcrumbs } from "../breadcrumbs";
import { ReadingProgress } from "../reading-progress";
import { ArticleToc, type TocItem } from "./article-toc";

interface ArticleLayoutProps {
  content: ContentRow;
  site: SiteDefinition;
  author?: AuthorRow | null;
  typeLabel?: string;
  backHref?: string;
  backLabel?: string;
  body: string;
  bodyIsHtml?: boolean;
  linkedProducts?: ProductRow[];
  featuredImage?: string | null;
  methodologyHref?: string;
  disclosure?: string;
  rightSidebar?: ReactNode;
  jsonLd?: ReactNode;
  preBody?: ReactNode;
  postBody?: ReactNode;
}

export function ArticleLayout({
  content,
  site,
  author,
  typeLabel,
  backHref,
  backLabel,
  body,
  bodyIsHtml = false,
  linkedProducts,
  featuredImage,
  methodologyHref,
  disclosure,
  rightSidebar,
  jsonLd,
  preBody,
  postBody,
}: ArticleLayoutProps) {
  const locale = (site.locale ?? "en-US").replace(/_/g, "-");
  const displayAuthorName = humanizeAuthorName(author?.name ?? content.author, site.name);
  const displayAuthor = author ? { ...author, name: displayAuthorName } : null;
  const safeExcerpt = stripAiDisclosure(content.excerpt ?? "");
  const safeBody = stripAiDisclosure(body);

  const { html: bodyHtml, toc: rawToc } = prepareArticleBody({
    body: safeBody,
    isHtml: bodyIsHtml,
    linkedProducts,
  });

  const titleLower = content.title.trim().toLowerCase();
  const toc = rawToc.filter((item) => item.text.trim().toLowerCase() !== titleLower);

  const readingTime = estimateReadingTime(bodyHtml);

  const published = content.publish_at ?? content.created_at;
  const updated = content.updated_at;

  const initials = displayAuthorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const authorHref = displayAuthor?.slug ? `/author/${displayAuthor.slug}` : undefined;

  const hasToc = toc.length > 0;
  const hasRight = !!rightSidebar;

  const containerClass = cn(
    "mx-auto px-4 py-8 md:py-12",
    !hasToc && !hasRight ? "max-w-3xl" : "max-w-7xl",
  );

  const gridClass = cn(
    "grid gap-8 lg:gap-12",
    hasToc && hasRight
      ? "lg:grid-cols-[220px_1fr_280px]"
      : hasToc
        ? "lg:grid-cols-[220px_1fr]"
        : hasRight
          ? "lg:grid-cols-[1fr_280px]"
          : "",
  );

  const tocItems: TocItem[] = toc.map((t) => ({ id: t.id, label: t.text, level: t.level }));

  return (
    <div className={containerClass}>
      {jsonLd}
      <ReadingProgress />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: backLabel ?? typeLabel ?? content.type, href: backHref },
          { label: content.title },
        ].filter((i): i is { label: string; href?: string } => Boolean(i.label))}
      />

      <div className={gridClass}>
        {hasToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <ArticleToc items={tocItems} />
            </div>
          </aside>
        )}

        <article className="min-w-0">
          <header className="mb-8">
            {backHref && backLabel && (
              <Link
                href={backHref}
                className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                ← {backLabel}
              </Link>
            )}

            {typeLabel && (
              <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-wider text-primary">
                {typeLabel}
              </span>
            )}

            <h1 className="text-pretty text-3xl font-bold leading-tight text-foreground md:text-4xl lg:text-5xl">
              {content.title}
            </h1>

            {safeExcerpt && (
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
                {safeExcerpt}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                {displayAuthor?.photo_url ? (
                  <Image
                    src={displayAuthor.photo_url}
                    alt={displayAuthorName}
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                )}
                <div className="leading-tight">
                  <p className="font-medium text-foreground">
                    By{" "}
                    {authorHref ? (
                      <Link href={authorHref} className="hover:underline">
                        {displayAuthorName}
                      </Link>
                    ) : (
                      displayAuthorName
                    )}
                  </p>
                  {displayAuthor?.credentials && (
                    <p className="text-muted-foreground">{displayAuthor.credentials}</p>
                  )}
                </div>
              </div>

              <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {published && (
                  <time dateTime={published}>
                    {new Date(published).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                )}
                <span aria-hidden="true">·</span>
                <span>{readingTime} min read</span>
                {methodologyHref && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Link
                      href={methodologyHref}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      How we test
                    </Link>
                  </>
                )}
              </div>
            </div>

            {updated && updated !== published && (
              <p className="mt-2 text-sm text-muted-foreground">
                Last updated:{" "}
                <time dateTime={updated}>
                  {new Date(updated).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </p>
            )}

            {disclosure && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {disclosure}
              </div>
            )}
          </header>

          {featuredImage && (
            <div className="relative mb-8 aspect-[16/9] w-full overflow-hidden rounded-xl border border-border">
              <Image
                src={featuredImage}
                alt={content.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 900px"
                priority
              />
            </div>
          )}

          {hasToc && (
            <details className="mb-8 rounded-lg border border-border bg-card p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Contents
              </summary>
              <div className="mt-3">
                <ArticleToc items={tocItems} />
              </div>
            </details>
          )}

          {preBody}

          <div
            dir={site.direction}
            className={cn(
              "prose prose-lg max-w-none",
              "prose-headings:font-semibold prose-headings:tracking-tight",
              "prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-2xl",
              "prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-xl",
              "prose-p:leading-[1.75] prose-a:font-medium prose-a:text-primary hover:prose-a:underline",
              "prose-img:rounded-lg prose-pre:overflow-x-auto",
              site.direction === "rtl" && "text-right",
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeHtmlMemoized(bodyHtml) }}
          />

          {postBody}
        </article>

        {hasRight && (
          <aside className="order-last hidden lg:block lg:w-72 lg:flex-shrink-0">
            <div className="sticky top-24">{rightSidebar}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

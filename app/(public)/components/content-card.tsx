import type { ContentRow } from "@/types/database";
import Link from "next/link";
import { highlightText } from "./highlight-text";
import { formatCardDate } from "@/lib/format-card-date";
import { ContentCardImage } from "./content-card-client";

interface ContentCardProps {
  content: ContentRow;
  locale?: string;
  /** Optional search query to highlight matching terms */
  searchQuery?: string;
  /** Mark as above-the-fold for LCP optimisation */
  priority?: boolean;
}

export function ContentCard({
  content,
  locale = "en-US",
  searchQuery,
  priority = false,
}: ContentCardProps) {
  const href = `/${content.type}/${content.slug}`;

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {content.featured_image && (
        <ContentCardImage
          href={href}
          src={content.featured_image}
          alt={content.title}
          priority={priority}
        />
      )}
      <div className="p-5">
        <Link href={href}>
          <h3 className="mb-2 text-xl font-semibold leading-tight transition-colors hover:[color:var(--color-accent,#10B981)]">
            {searchQuery ? highlightText(content.title, searchQuery) : content.title}
          </h3>
        </Link>
        {content.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-600">
            {searchQuery ? highlightText(content.excerpt, searchQuery) : content.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{content.type}</span>
          {(content.publish_at ?? content.created_at) && (
            <time dateTime={content.publish_at ?? content.created_at}>
              {formatCardDate(content.publish_at ?? content.created_at, locale)}
            </time>
          )}
        </div>
      </div>
    </article>
  );
}

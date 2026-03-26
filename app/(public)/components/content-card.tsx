import type { ContentRow } from "@/types/database";
import Link from "next/link";

interface ContentCardProps {
  content: ContentRow;
}

export function ContentCard({ content }: ContentCardProps) {
  const href = `/${content.content_type}/${content.slug}`;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {content.featured_image && (
        <div className="mb-3 overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.featured_image}
            alt={content.title}
            className="h-44 w-full object-cover"
          />
        </div>
      )}
      <Link href={href}>
        <h3 className="mb-2 text-xl font-semibold leading-tight hover:text-emerald-600">
          {content.title}
        </h3>
      </Link>
      {content.excerpt && (
        <p className="mb-3 line-clamp-2 text-sm text-gray-600">{content.excerpt}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{content.content_type}</span>
        {content.published_at && (
          <time dateTime={content.published_at}>
            {new Date(content.published_at).toLocaleDateString("ar-SA")}
          </time>
        )}
      </div>
    </article>
  );
}

import Link from "next/link";
import type { ContentRow } from "@/types/database";

interface ContentCardProps {
  content: ContentRow;
}

export function ContentCard({ content }: ContentCardProps) {
  return (
    <Link
      href={`/content/${content.slug}`}
      className="group block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      {content.featured_image && (
        <div className="mb-3 overflow-hidden rounded bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.featured_image}
            alt={content.title}
            className="h-40 w-full object-cover"
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
          {content.content_type}
        </span>
        {content.published_at && (
          <time dateTime={content.published_at}>
            {new Date(content.published_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        )}
      </div>

      <h3 className="mt-2 text-base font-semibold text-gray-900 group-hover:text-blue-600">
        {content.title}
      </h3>

      {content.excerpt && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{content.excerpt}</p>
      )}

      {content.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {content.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

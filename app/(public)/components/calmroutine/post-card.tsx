import Image from "next/image";
import Link from "next/link";
import { formatCalmDate, type CalmPost, type CalmCategorySlug } from "@/lib/calmroutine";
import { type CalmSiteConfig } from "@/lib/calm-config";
import { CalmCategoryBadge } from "./category-badge";

export function CalmPostCard({
  post,
  categoryBadge,
}: {
  post: CalmPost;
  categoryBadge: Record<CalmCategorySlug, CalmSiteConfig["categoryBadge"][CalmCategorySlug]>;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-card">
      <Link href={`/${post.slug}`} className="block overflow-hidden">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src={post.featuredImage || "/placeholder.svg"}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <CalmCategoryBadge category={post.category} badge={categoryBadge[post.category]} />
        <h3 className="font-serif text-xl leading-snug text-text-primary text-balance">
          <Link href={`/${post.slug}`} className="transition-colors hover:text-accent-dark">
            {post.title}
          </Link>
        </h3>
        <p className="text-sm leading-relaxed text-text-secondary">{post.excerpt}</p>
        <p className="mt-auto pt-2 text-xs text-text-secondary">
          {formatCalmDate(post.publishedAt)} · {post.readTimeMinutes} min read
        </p>
      </div>
    </article>
  );
}

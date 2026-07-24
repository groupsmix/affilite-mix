import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { calmAuthor, calmCategories, formatCalmDate, type CalmPost } from "@/lib/calmroutine";
import { CalmCategoryBadge } from "./category-badge";
import { CalmAffiliateCallout } from "./affiliate-callout";
import { CalmAuthorBio } from "./author-bio";

function slugifyHeading(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CalmPostView({ post }: { post: CalmPost }) {
  const category = calmCategories[post.category];
  const showToc = post.body.length > 2;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
          <li>
            <Link href="/" className="hover:text-accent-dark">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <li>
            <Link href={`/category/${category.slug}`} className="hover:text-accent-dark">
              {category.name}
            </Link>
          </li>
        </ol>
      </nav>

      <header>
        <CalmCategoryBadge category={post.category} />
        <h1 className="mt-4 font-serif text-3xl leading-tight text-text-primary text-balance sm:text-4xl">
          {post.title}
        </h1>
        <div className="mt-5 flex items-center gap-3 text-sm text-text-secondary">
          <Image
            src={calmAuthor.avatarUrl || "/placeholder.svg"}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
          />
          <span>
            {calmAuthor.name} · {formatCalmDate(post.publishedAt)} · {post.readTimeMinutes} min read
          </span>
        </div>
      </header>

      <figure className="my-8 overflow-hidden rounded-xl border border-border-subtle">
        <Image
          src={post.featuredImage || "/placeholder.svg"}
          alt={post.title}
          width={1200}
          height={800}
          className="h-auto w-full object-cover"
          priority
        />
      </figure>

      {showToc && (
        <nav
          aria-label="Table of contents"
          className="mb-8 rounded-xl border border-border-subtle bg-card p-5"
        >
          <p className="text-xs font-medium tracking-wide text-accent-mid">On this page</p>
          <ul className="mt-3 space-y-2 text-sm">
            {post.body.map((section) => (
              <li key={section.heading}>
                <Link
                  href={`#${slugifyHeading(section.heading)}`}
                  className="text-text-secondary hover:text-accent-dark"
                >
                  {section.heading}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <article className="text-base leading-[1.7] text-text-primary">
        <p className="mb-8 font-serif text-xl leading-relaxed text-text-secondary text-pretty">
          {post.excerpt}
        </p>
        {post.body.map((section) => (
          <section key={section.heading} className="mb-2">
            <h2
              id={slugifyHeading(section.heading)}
              className="mb-3 mt-8 scroll-mt-24 font-serif text-2xl text-text-primary"
            >
              {section.heading}
            </h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mb-4 text-text-primary/90">
                {p}
              </p>
            ))}
            {section.affiliate && <CalmAffiliateCallout {...section.affiliate} />}
          </section>
        ))}
      </article>

      <CalmAuthorBio />

      <p className="mt-8 rounded-lg bg-accent-tint/60 px-5 py-4 text-xs leading-relaxed text-text-secondary">
        This article is educational and offers tools that many people find helpful. It is not
        medical advice and does not diagnose or treat any condition.
      </p>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { calmCategories, getCalmPostsByCategory, type CalmCategorySlug } from "@/lib/calmroutine";
import { CalmPostCard } from "./post-card";

export function CalmCategoryPage({ category }: { category: CalmCategorySlug }) {
  const cat = calmCategories[category];
  if (!cat) notFound();
  const categoryPosts = getCalmPostsByCategory(cat.slug);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-xs text-text-secondary">
          <li>
            <Link href="/" className="hover:text-accent-dark">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <li className="text-text-primary">{cat.name}</li>
        </ol>
      </nav>

      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl text-text-primary text-balance">{cat.name}</h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary text-pretty">{cat.intro}</p>
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {categoryPosts.map((post) => (
          <CalmPostCard key={post.slug} post={post} />
        ))}
      </div>
    </>
  );
}

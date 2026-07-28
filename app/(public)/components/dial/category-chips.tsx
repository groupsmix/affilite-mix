import Link from "next/link";
import type { CategoryRow } from "@/types/database";

interface CategoryChipsProps {
  categories: (CategoryRow & { product_count: number })[];
}

export function CategoryChips({ categories }: CategoryChipsProps) {
  const chips = categories
    .filter((c) => c.product_count > 0)
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, 10);

  if (chips.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 md:px-6">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
        {chips.map((c) => (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

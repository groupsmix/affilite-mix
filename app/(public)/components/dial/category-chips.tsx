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
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-6">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {chips.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="shrink-0 rounded-md border border-border bg-transparent px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

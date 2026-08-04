import Link from "next/link";
import { Search } from "lucide-react";
import type { DialHomepageConfig } from "@/lib/dial-config";

interface FilterBarProps {
  config: DialHomepageConfig;
}

export function FilterBar({ config }: FilterBarProps) {
  const pills = [
    { label: "All", href: "/", active: true },
    ...config.priceTiers.map((t) => ({
      label: t.label,
      href: t.href ?? `/${t.guideSlug ?? `best-watches-${t.id}`}`,
      active: false,
    })),
    { label: "Diver", href: "/search?q=diver", active: false },
    { label: "Dress", href: "/search?q=dress", active: false },
  ];

  return (
    <section className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Find a watch
          </span>
          <form action="/search" method="get" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="Brand, style, budget…"
              className="h-9 w-52 border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </form>
        </div>

        <nav aria-label="Quick filters" className="flex flex-wrap items-center gap-2">
          {pills.map((pill) =>
            pill.active ? (
              <span
                key={pill.label}
                className="inline-flex h-8 items-center bg-primary px-3.5 text-xs font-medium text-primary-foreground"
                aria-current="page"
              >
                {pill.label}
              </span>
            ) : (
              <Link
                key={pill.label}
                href={pill.href}
                className="inline-flex h-8 items-center border border-border px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {pill.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </section>
  );
}

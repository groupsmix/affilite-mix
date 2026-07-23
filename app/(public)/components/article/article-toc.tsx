export type TocItem = { id: string; label: string };

export function ArticleToc({ items }: { items: TocItem[] }) {
  return (
    <nav aria-label="Table of contents" className="rounded-xl border border-border bg-card/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        In this guide
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex gap-2 text-muted-foreground transition-colors hover:text-primary"
            >
              <span className="text-primary/70">{i + 1}.</span>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

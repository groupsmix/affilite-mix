import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="mx-1 text-gray-300" aria-hidden="true">
                ›
              </span>
            )}
            {item.href && i < items.length - 1 ? (
              <Link
                href={item.href}
                className="rounded px-1 py-0.5 font-medium transition-colors hover:text-[color:var(--color-accent-text,#15803D)] hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-gray-700">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

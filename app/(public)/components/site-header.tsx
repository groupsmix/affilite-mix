import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";

interface SiteHeaderProps {
  site: SiteDefinition;
}

export function SiteHeader({ site }: SiteHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
          {site.name}
        </Link>
        <nav className="hidden gap-6 md:flex">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.title}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

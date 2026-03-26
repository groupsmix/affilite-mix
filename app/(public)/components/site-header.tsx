import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";

interface SiteHeaderProps {
  site: SiteDefinition;
}

export function SiteHeader({ site }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold" style={{ color: site.theme.primaryColor }}>
          {site.name}
        </Link>
        <nav className="flex items-center gap-6">
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

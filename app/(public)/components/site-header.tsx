import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { MobileMenu } from "./mobile-menu";

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
        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.title}
            </Link>
          ))}
          <Link
            href="/search"
            className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-900"
            aria-label={site.language === "ar" ? "بحث" : "Search"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
          </Link>
        </nav>
        {/* Mobile nav */}
        <MobileMenu nav={site.nav} searchLabel={site.language === "ar" ? "بحث" : "Search"} />
      </div>
    </header>
  );
}

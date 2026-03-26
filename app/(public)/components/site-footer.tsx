import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";

interface SiteFooterProps {
  site: SiteDefinition;
}

export function SiteFooter({ site }: SiteFooterProps) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-bold text-gray-900">{site.name}</h3>
            <p className="mt-2 text-sm text-gray-500">{site.brand.description}</p>
          </div>

          {/* Footer nav groups */}
          {Object.entries(site.footerNav).map(([group, items]) => (
            <div key={group}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                {group.replace(/([A-Z])/g, " $1").trim()}
              </h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          {site.affiliateDisclosure}
        </div>
      </div>
    </footer>
  );
}

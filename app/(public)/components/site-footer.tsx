import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { NewsletterSignup } from "./newsletter-signup";

interface SiteFooterProps {
  site: SiteDefinition;
  /** When true, skip the newsletter section (e.g. the page already renders one). */
  hideNewsletter?: boolean;
}

export function SiteFooter({ site, hideNewsletter }: SiteFooterProps) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="mb-2 text-lg font-bold">{site.name}</h3>
            <p className="text-sm text-gray-600">{site.brand.description}</p>
          </div>

          {/* Footer nav sections */}
          {Object.entries(site.footerNav).map(([section, items]) => (
            <div key={section}>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
                {section}
              </h4>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter signup — only when feature is enabled and not already on the page */}
        {site.features.newsletter && !hideNewsletter && (
          <div className="mt-8">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        )}

        {/* Affiliate disclosure */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-400">{site.affiliateDisclosure}</p>
          <p className="mt-2 text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {site.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

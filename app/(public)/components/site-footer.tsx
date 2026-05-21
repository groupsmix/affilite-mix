import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { NewsletterSignup } from "./newsletter-signup";
import { CookieSettingsButton } from "./cookie-settings-button";

interface SiteFooterProps {
  site: SiteDefinition;
  /** When true, skip the newsletter section (e.g. the page already renders one). */
  hideNewsletter?: boolean;
  /** Optional dynamic footer nav items from DB (renders as a flat list alongside config nav) */
  dbFooterNav?: { label: string; href: string; icon?: string }[];
}

export function SiteFooter({ site, hideNewsletter, dbFooterNav }: SiteFooterProps) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="mb-2 text-lg font-bold">{site.name}</h3>
            <p className="text-sm text-gray-600">{site.brand.description}</p>
          </div>

          {/* Footer nav sections (from config) */}
          {Object.entries(site.footerNav).map(([section, items]) => (
            <div key={section}>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                {section}
              </h4>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    {item.href.startsWith("http") ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link href={item.href} className="text-sm text-gray-600 hover:text-gray-900">
                        {item.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Dynamic footer nav from DB */}
          {dbFooterNav && dbFooterNav.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                {site?.language === "ar" ? "الصفحات" : "Pages"}
              </h4>
              <ul className="space-y-1">
                {dbFooterNav.map((item) => (
                  <li key={item.href}>
                    {item.href.startsWith("http") ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className="text-sm text-gray-600 hover:text-gray-900">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Newsletter signup — only when feature is enabled and not already on the page */}
        {site.features.newsletter && !hideNewsletter && (
          <div className="mt-8">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        )}

        {/* Monetization disclosure */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-500">
            {site.monetizationType === "ads"
              ? site.language === "ar"
                ? "يتم تمويل هذا الموقع عبر الإعلانات."
                : "This site is supported by advertising."
              : site.affiliateDisclosure}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>
              &copy; {new Date().getFullYear()} {site.name}
            </span>
            <span aria-hidden="true">&middot;</span>
            <Link href="/privacy" className="hover:text-gray-600">
              {site.language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <span aria-hidden="true">&middot;</span>
            <CookieSettingsButton
              label={site.language === "ar" ? "إعدادات ملفات تعريف الارتباط" : "Cookie Settings"}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

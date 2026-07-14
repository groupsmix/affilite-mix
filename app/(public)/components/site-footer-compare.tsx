/**
 * "compare" layout variant footer — used by compareai.site / AI Compared.
 *
 * Design language:
 *   - Dark navy (#0B1120) background matching the header
 *   - Cobalt top accent stripe for visual continuity
 *   - Two-tone wordmark in the brand block
 *   - "Independent reviews. No sponsored rankings." trust tagline
 *   - Structured nav grid (quick links + legal)
 *   - Optional newsletter section with cobalt CTA
 *   - Dark bottom bar with copyright + legal micro-links
 */

import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { NewsletterSignup } from "./newsletter-signup";
import { CookieSettingsButton } from "./cookie-settings-button";

interface SiteFooterCompareProps {
  site: SiteDefinition;
  hideNewsletter?: boolean;
  dbFooterNav?: { label: string; href: string; icon?: string }[];
}

export function SiteFooterCompare({ site, hideNewsletter, dbFooterNav }: SiteFooterCompareProps) {
  const year = new Date().getFullYear();

  // Two-tone wordmark parts
  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  return (
    <footer style={{ backgroundColor: "var(--color-primary, #0B1120)" }}>
      {/* Cobalt top accent stripe */}
      <div
        className="h-0.5 w-full"
        style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-4 pt-12 pb-0">
        {/* Brand block + trust tagline */}
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            {/* Two-tone wordmark */}
            <div className="flex items-baseline gap-0.5 text-2xl font-extrabold tracking-tight select-none font-heading">
              <span className="text-white">{part1}</span>
              {part2 && (
                <span style={{ color: "var(--color-accent-light, #3B82F6)" }}>&nbsp;{part2}</span>
              )}
            </div>
            <p className="mt-1 max-w-sm text-sm text-gray-400">{site.brand.description}</p>
          </div>
          {/* Trust tagline */}
          <p className="text-xs italic text-gray-400">
            Independent reviews. No sponsored rankings.
          </p>
        </div>

        {/* Nav grid */}
        <div className="grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Config nav sections */}
          {Object.entries(site.footerNav).map(([section, items]) => (
            <div key={section}>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                {section}
              </h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.href}>
                    {item.href.startsWith("http") ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-400 transition-colors hover:text-white"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm text-gray-400 transition-colors hover:text-white"
                      >
                        {item.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* DB-injected nav section */}
          {dbFooterNav && dbFooterNav.length > 0 && (
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Pages
              </h4>
              <ul className="space-y-2">
                {dbFooterNav.map((item) => (
                  <li key={item.href}>
                    {item.href.startsWith("http") ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-400 transition-colors hover:text-white"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm text-gray-400 transition-colors hover:text-white"
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Newsletter */}
        {site.features.newsletter && !hideNewsletter && (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/5 px-6 py-6">
            <NewsletterSignup
              siteLanguage={site.language}
              className="dark bg-transparent border-0"
            />
          </div>
        )}

        {/* Bottom bar */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 text-xs text-gray-400">
          <span>
            &copy; {year} {site.name}. All rights reserved.
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/affiliate-disclosure" className="transition-colors hover:text-white">
              Affiliate Disclosure
            </Link>
            <CookieSettingsButton
              label="Cookie Settings"
              className="text-gray-400 transition-colors hover:text-white"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { NewsletterSignup } from "./newsletter-signup";
import { CookieSettingsButton } from "./cookie-settings-button";

interface SiteFooterMagazineProps {
  site: SiteDefinition;
  hideNewsletter?: boolean;
  dbFooterNav?: { label: string; href: string; icon?: string }[];
}

export function SiteFooterMagazine({ site, hideNewsletter, dbFooterNav }: SiteFooterMagazineProps) {
  const nameParts = site.name.split(" ");
  const part1 = nameParts[0] ?? site.name;
  const part2 = nameParts.slice(1).join(" ");

  const quickLinks = site.footerNav.quickLinks ?? [];
  const legal = site.footerNav.legal ?? [];
  const language = site.language;

  return (
    <footer
      className="border-t border-white/10 py-12"
      style={{ backgroundColor: "var(--color-primary, #0f172a)" }}
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="flex items-center gap-0.5 select-none font-heading"
              aria-label={site.name}
            >
              <span className="text-2xl font-extrabold tracking-tight text-white">{part1}</span>
              {part2 && (
                <span
                  className="text-2xl font-extrabold tracking-tight"
                  style={{ color: "var(--color-accent-light, var(--color-accent))" }}
                >
                  &nbsp;{part2}
                </span>
              )}
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              {site.brand.description}
            </p>
            {site.features.newsletter && !hideNewsletter && (
              <div className="mt-6 max-w-md">
                <NewsletterSignup siteLanguage={language} className="dark" />
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
              {language === "ar" ? "روابط سريعة" : "Quick Links"}
            </h4>
            <ul className="space-y-2">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
              {dbFooterNav?.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
              {language === "ar" ? "قانوني" : "Legal"}
            </h4>
            <ul className="space-y-2">
              {legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="text-xs text-white/50">
            {site.monetizationType === "ads"
              ? language === "ar"
                ? "يتم تمويل هذا الموقع عبر الإعلانات."
                : "This site is supported by advertising."
              : site.affiliateDisclosure}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
            <span>
              &copy; {new Date().getFullYear()} {site.name}
            </span>
            <span aria-hidden="true">&middot;</span>
            <Link href="/privacy" className="hover:text-white">
              {language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <span aria-hidden="true">&middot;</span>
            <CookieSettingsButton
              label={language === "ar" ? "إعدادات ملفات تعريف الارتباط" : "Cookie Settings"}
              className="text-white/50 hover:text-white"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

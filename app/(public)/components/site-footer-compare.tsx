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

  const navItems = [
    ...(site.footerNav.quickLinks ?? []).map((item) => ({ href: item.href, label: item.title })),
    ...(site.footerNav.legal ?? []).map((item) => ({ href: item.href, label: item.title })),
    ...(dbFooterNav ?? []).map((item) => ({ href: item.href, label: item.label })),
  ]
    .filter((item) => Boolean(item.href) && Boolean(item.label))
    .filter((item, index, self) => self.findIndex((i) => i.href === item.href) === index);

  return (
    <footer style={{ backgroundColor: "var(--color-primary, #0B1120)" }}>
      {site.slug !== "crypto-tools" && (
        <div
          className="h-0.5 w-full"
          style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          aria-hidden="true"
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <span className="text-lg font-semibold text-white">{site.name}</span>
          <nav
            className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300"
            aria-label="Footer"
          >
            {navItems.map((item) =>
              item.href.startsWith("http") ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        {site.features.newsletter && !hideNewsletter && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 px-6 py-6">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        )}

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-8 text-xs text-slate-300 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl">
            &copy; {year} {site.name}. {site.affiliateDisclosure || site.contentDisclosure}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/affiliate-disclosure" className="transition-colors hover:text-white">
              Disclosure
            </Link>
            <CookieSettingsButton
              label="Cookies"
              className="text-slate-300 transition-colors hover:text-white"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { NewsletterSignup } from "./newsletter-signup";
import { CookieSettingsButton } from "./cookie-settings-button";

interface SiteFooterCompareProps {
  site: SiteDefinition;
  hideNewsletter?: boolean;
  dbFooterNav?: { label: string; href: string; icon?: string }[];
}

interface FooterColumn {
  heading: string;
  links: { href: string; label: string }[];
}

const ACCENT = "#2D6BF0";
const INK = "#0B1120";

export function SiteFooterCompare({ site, hideNewsletter, dbFooterNav }: SiteFooterCompareProps) {
  // New light "evaluation lab" identity ships on CompareAI; other compare-layout
  // tenants (e.g. crypto-tools) keep the branded dark footer.
  if (site.slug === "ai-compared") {
    return <LightLabFooter site={site} hideNewsletter={hideNewsletter} dbFooterNav={dbFooterNav} />;
  }
  return <DarkCompareFooter site={site} hideNewsletter={hideNewsletter} dbFooterNav={dbFooterNav} />;
}

function LightLabFooter({ site, hideNewsletter, dbFooterNav }: SiteFooterCompareProps) {
  const year = new Date().getFullYear();

  const quickLinks = (site.footerNav.quickLinks ?? []).map((item) => ({
    href: item.href,
    label: item.title,
  }));
  const legalLinks = (site.footerNav.legal ?? []).map((item) => ({
    href: item.href,
    label: item.title,
  }));
  const dbLinks = (dbFooterNav ?? [])
    .filter((item) => Boolean(item.href) && Boolean(item.label))
    .map((item) => ({ href: item.href, label: item.label }));

  const columns: FooterColumn[] = [
    { heading: "Audits", links: quickLinks.slice(0, 4) },
    {
      heading: "Resources",
      links: [
        { href: "/how-we-rank", label: "Methodology" },
        ...dbLinks.slice(0, 3),
      ].slice(0, 4),
    },
    { heading: "Legal", links: legalLinks.slice(0, 4) },
  ].filter((col) => col.links.length > 0);

  return (
    <footer className="border-t border-slate-200 bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <span className="text-xl font-bold tracking-tight" style={{ color: INK }}>
              {site.name.endsWith("AI") ? (
                <>
                  {site.name.slice(0, -2)}
                  <span style={{ color: ACCENT }}>AI</span>
                </>
              ) : (
                site.name
              )}
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              {site.brand.description}
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.heading}>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-900">
                  {col.heading}
                </h3>
                <ul className="mt-5 space-y-3.5">
                  {col.links.map((item) => (
                    <li key={item.href}>
                      {item.href.startsWith("http") ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-slate-500 transition-colors hover:text-slate-900"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-sm text-slate-500 transition-colors hover:text-slate-900"
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {site.features.newsletter && !hideNewsletter && (
          <div className="mt-14 border-t border-slate-100 pt-10">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        )}

        <div className="mt-14 flex flex-col gap-3 border-t border-slate-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#22C55E" }} />
            &copy; {year} Independent Evaluation Lab. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
            <span>
              Uptime: <span className="text-slate-600">99.98%</span>
            </span>
            <CookieSettingsButton
              label="Cookies"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400 transition-colors hover:text-slate-900"
            />
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-slate-400">
          {site.affiliateDisclosure || site.contentDisclosure}
        </p>
      </div>
    </footer>
  );
}

/** Original dark, branded compare footer (kept for non-CompareAI tenants). */
function DarkCompareFooter({ site, hideNewsletter, dbFooterNav }: SiteFooterCompareProps) {
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
              Privacy Policy
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

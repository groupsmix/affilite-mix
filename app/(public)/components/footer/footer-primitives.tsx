/**
 * Shared, accessible footer building blocks. Every footer variant composes
 * these so nav semantics, external-link handling, the newsletter gate and the
 * legal/disclosure bar stay consistent regardless of the chosen design.
 */
import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { FooterConfig } from "@/config/presentation";
import { CONTAINER_WIDTH_CLASS } from "@/config/presentation";
import { NewsletterSignup } from "../newsletter-signup";
import { CookieSettingsButton } from "../cookie-settings-button";

export interface FooterVariantProps {
  site: SiteDefinition;
  /** When true, skip the newsletter section (e.g. the page already renders one). */
  hideNewsletter?: boolean;
  /** Optional dynamic footer nav items from the DB. */
  dbFooterNav?: { label: string; href: string; icon?: string }[];
  /** Validated footer options (newsletter visibility, container width). */
  config: FooterConfig;
}

export function footerContainerClass(config: FooterConfig): string {
  return CONTAINER_WIDTH_CLASS[config.containerWidth];
}

/** Turn a camelCase footerNav section key (e.g. "quickLinks") into spaced words. */
function humanizeSection(section: string): string {
  return section.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Internal (next/link) or external (new-tab, rel-safe) link, chosen by href. */
function FooterLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** Config-driven nav sections + any DB-injected pages, as a heading/list grid. */
export function FooterNavSections({
  site,
  dbFooterNav,
  headingClass,
  linkClass,
}: {
  site: SiteDefinition;
  dbFooterNav?: { label: string; href: string; icon?: string }[];
  headingClass: string;
  linkClass: string;
}) {
  return (
    <>
      {Object.entries(site.footerNav).map(([section, items]) => (
        <div key={section}>
          <h4 className={headingClass}>{humanizeSection(section)}</h4>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <FooterLink href={item.href} className={linkClass}>
                  {item.title}
                </FooterLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {dbFooterNav && dbFooterNav.length > 0 && (
        <div>
          <h4 className={headingClass}>{site.language === "ar" ? "الصفحات" : "Pages"}</h4>
          <ul className="space-y-1">
            {dbFooterNav.map((item) => (
              <li key={item.href}>
                <FooterLink href={item.href} className={linkClass}>
                  {item.label}
                </FooterLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Newsletter block, gated by BOTH the site feature flag and the (DB-authored)
 * footer config. Returns null when it should not render.
 */
export function FooterNewsletter({
  site,
  config,
  hideNewsletter,
  className,
}: {
  site: SiteDefinition;
  config: FooterConfig;
  hideNewsletter?: boolean;
  className?: string;
}) {
  if (!config.showNewsletter || !site.features.newsletter || hideNewsletter) return null;
  return (
    <div className={className}>
      <NewsletterSignup siteLanguage={site.language} />
    </div>
  );
}

/** Monetization disclosure + copyright + privacy/cookie micro-links. */
export function FooterLegal({ site, linkClass }: { site: SiteDefinition; linkClass: string }) {
  return (
    <>
      <p className="text-xs text-gray-600">
        {site.monetizationType === "ads"
          ? site.language === "ar"
            ? "يتم تمويل هذا الموقع عبر الإعلانات."
            : "This site is supported by advertising."
          : site.affiliateDisclosure}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>
          &copy; {new Date().getFullYear()} {site.name}
        </span>
        <span aria-hidden="true">&middot;</span>
        <Link href="/privacy" className={linkClass}>
          {site.language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
        </Link>
        <span aria-hidden="true">&middot;</span>
        <CookieSettingsButton
          label={site.language === "ar" ? "إعدادات ملفات تعريف الارتباط" : "Cookie Settings"}
        />
      </div>
    </>
  );
}

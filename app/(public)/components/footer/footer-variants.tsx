/**
 * The concrete footer designs. Each variant composes the shared footer
 * primitives so nav/newsletter/legal semantics are identical across designs —
 * they differ only in layout, density and colour. New designs are added here
 * and registered in ./registry.ts.
 */
import { SiteFooterCompare } from "../site-footer-compare";
import {
  type FooterVariantProps,
  FooterLegal,
  FooterNavSections,
  FooterNewsletter,
  footerContainerClass,
} from "./footer-primitives";

const HEADING = "mb-2 text-sm font-semibold uppercase tracking-wider text-gray-600";
const LINK = "text-sm text-gray-600 hover:text-gray-900";

/** Standard three-column footer on a light surface (the default). */
export function StandardFooter({ site, hideNewsletter, dbFooterNav, config }: FooterVariantProps) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10">
      <div className={`mx-auto ${footerContainerClass(config)} px-4`}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-lg font-bold">{site.name}</h3>
            <p className="text-sm text-gray-600">{site.brand.description}</p>
          </div>
          <FooterNavSections
            site={site}
            dbFooterNav={dbFooterNav}
            headingClass={HEADING}
            linkClass={LINK}
          />
        </div>
        <FooterNewsletter
          site={site}
          config={config}
          hideNewsletter={hideNewsletter}
          className="mt-8"
        />
        <div className="mt-8 border-t border-gray-200 pt-6">
          <FooterLegal site={site} linkClass="hover:text-gray-900" />
        </div>
      </div>
    </footer>
  );
}

/** Dark, editorial compare footer with accent stripe (kept as-is). */
export function CompareFooter({ site, hideNewsletter, dbFooterNav }: FooterVariantProps) {
  return (
    <SiteFooterCompare site={site} hideNewsletter={hideNewsletter} dbFooterNav={dbFooterNav} />
  );
}

/** Magazine: centered brand masthead, nav below, generous spacing. */
export function MagazineFooter({ site, hideNewsletter, dbFooterNav, config }: FooterVariantProps) {
  return (
    <footer className="border-t border-gray-200 bg-white py-12">
      <div className={`mx-auto ${footerContainerClass(config)} px-4 text-center`}>
        <h3 className="text-2xl font-serif font-bold tracking-tight">{site.name}</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">{site.brand.description}</p>
        <FooterNewsletter
          site={site}
          config={config}
          hideNewsletter={hideNewsletter}
          className="mx-auto mt-8 max-w-md"
        />
        <div className="mt-10 grid gap-8 border-t border-gray-200 pt-8 text-left sm:grid-cols-2 lg:grid-cols-3">
          <FooterNavSections
            site={site}
            dbFooterNav={dbFooterNav}
            headingClass={HEADING}
            linkClass={LINK}
          />
        </div>
        <div className="mt-8 border-t border-gray-200 pt-6 text-left">
          <FooterLegal site={site} linkClass="hover:text-gray-900" />
        </div>
      </div>
    </footer>
  );
}

/** Minimal: single compact row of legal links, no nav grid, borderless top. */
export function MinimalFooter({ site, hideNewsletter, dbFooterNav, config }: FooterVariantProps) {
  return (
    <footer className="bg-gray-50 py-8">
      <div className={`mx-auto ${footerContainerClass(config)} px-4`}>
        <FooterNewsletter
          site={site}
          config={config}
          hideNewsletter={hideNewsletter}
          className="mb-6"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-semibold">{site.name}</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.values(site.footerNav)
              .flat()
              .slice(0, 6)
              .map((item) => (
                <a key={item.href} href={item.href} className={LINK}>
                  {item.title}
                </a>
              ))}
            {(dbFooterNav ?? []).slice(0, 4).map((item) => (
              <a key={item.href} href={item.href} className={LINK}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-6 border-t border-gray-200 pt-4">
          <FooterLegal site={site} linkClass="hover:text-gray-900" />
        </div>
      </div>
    </footer>
  );
}

/** Directory: four-column, denser nav grid emphasising browseable sections. */
export function DirectoryFooter({ site, hideNewsletter, dbFooterNav, config }: FooterVariantProps) {
  return (
    <footer className="border-t border-gray-200 bg-white py-10">
      <div className={`mx-auto ${footerContainerClass(config)} px-4`}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <h3 className="mb-2 text-lg font-bold">{site.name}</h3>
            <p className="text-sm text-gray-600">{site.brand.description}</p>
          </div>
          <FooterNavSections
            site={site}
            dbFooterNav={dbFooterNav}
            headingClass={HEADING}
            linkClass={LINK}
          />
        </div>
        <FooterNewsletter
          site={site}
          config={config}
          hideNewsletter={hideNewsletter}
          className="mt-8"
        />
        <div className="mt-8 border-t border-gray-200 pt-6">
          <FooterLegal site={site} linkClass="hover:text-gray-900" />
        </div>
      </div>
    </footer>
  );
}

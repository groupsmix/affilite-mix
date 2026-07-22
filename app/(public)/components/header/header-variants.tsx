/**
 * The concrete header designs. Each variant is a composition of the shared
 * accessible primitives inside the shared HeaderShell — so they differ in
 * layout and tokens, not in a11y/RTL implementation. New designs are added
 * here and registered in ./registry.ts.
 */
import type { SiteDefinition, NavItem } from "@/config/site-definition";
import type { HeaderConfig, HeaderTokens } from "@/config/presentation";
import { HeaderShell } from "./header-shell";
import {
  HeaderCta,
  HeaderMobile,
  HeaderNav,
  HeaderSearch,
  HeaderWordmark,
  containerWidthClass,
} from "./header-primitives";

export interface HeaderVariantProps {
  site: SiteDefinition;
  nav: NavItem[];
  config: HeaderConfig;
  tokens: HeaderTokens;
  searchLabel: string;
  navLabel: string;
}

/** Resolve the CTA link + label, deriving a sensible target/label when unset. */
function resolveCta(
  config: HeaderConfig,
  nav: NavItem[],
  fallbackLabel: string,
): { href: string; label: string } | null {
  if (!config.showCta) return null;
  const label = config.ctaLabel || fallbackLabel;
  if (!label) return null;
  const href =
    config.ctaHref && config.ctaHref !== "/"
      ? config.ctaHref
      : (nav.find((n) => n.href.includes("comparison"))?.href ??
        nav.find((n) => n.href.includes("review"))?.href ??
        "/");
  return { href, label };
}

/** Shared single-row bar layout used by standard/compare/directory. */
function BarHeader({
  props,
  ctaFallbackLabel,
  topAccentStripe = false,
}: {
  props: HeaderVariantProps;
  ctaFallbackLabel: string;
  topAccentStripe?: boolean;
}) {
  const { site, nav, config, tokens, searchLabel, navLabel } = props;
  const width = containerWidthClass(config.containerWidth);
  const cta = resolveCta(config, nav, ctaFallbackLabel);
  return (
    <HeaderShell
      tokens={tokens}
      config={config}
      widthClass={width}
      barClassName="justify-between"
      topAccentStripe={topAccentStripe}
    >
      <HeaderWordmark site={site} logoMode={config.logoMode} />
      <HeaderNav nav={nav} alignment={config.navAlignment} ariaLabel={navLabel} />
      <div className="flex items-center gap-2">
        {config.showSearch && <HeaderSearch label={searchLabel} />}
        {cta && <HeaderCta href={cta.href} label={cta.label} />}
        <HeaderMobile
          nav={nav}
          appearance={tokens.appearance}
          searchLabel={searchLabel}
          direction={site.direction}
        />
      </div>
    </HeaderShell>
  );
}

export function StandardHeader(props: HeaderVariantProps) {
  const ctaFallback = props.site.language === "ar" ? "قارن" : "Compare";
  return <BarHeader props={props} ctaFallbackLabel={ctaFallback} />;
}

export function CompareHeader(props: HeaderVariantProps) {
  const ctaFallback =
    props.site.language === "ar" ? "قارن" : `Compare ${props.site.productLabelPlural}`;
  return <BarHeader props={props} ctaFallbackLabel={ctaFallback} topAccentStripe />;
}

export function DirectoryHeader(props: HeaderVariantProps) {
  const ctaFallback = props.site.language === "ar" ? "استكشف" : "Browse";
  return <BarHeader props={props} ctaFallbackLabel={ctaFallback} />;
}

export function MinimalHeader(props: HeaderVariantProps) {
  const { site, nav, config, tokens, searchLabel, navLabel } = props;
  const width = containerWidthClass(config.containerWidth);
  return (
    <HeaderShell
      tokens={tokens}
      config={config}
      widthClass={width}
      barClassName="justify-between"
      flush
    >
      <HeaderWordmark site={site} logoMode={config.logoMode} />
      <HeaderNav nav={nav} alignment={config.navAlignment} ariaLabel={navLabel} />
      <div className="flex items-center gap-2">
        {config.showSearch && <HeaderSearch label={searchLabel} />}
        <HeaderMobile
          nav={nav}
          appearance={tokens.appearance}
          searchLabel={searchLabel}
          direction={site.direction}
        />
      </div>
    </HeaderShell>
  );
}

/** Centered editorial masthead: wordmark on top, nav centered beneath. */
export function MagazineHeader(props: HeaderVariantProps) {
  const { site, nav, config, tokens, searchLabel, navLabel } = props;
  const width = containerWidthClass(config.containerWidth);
  return (
    <HeaderShell
      tokens={tokens}
      config={config}
      widthClass={width}
      barClassName="flex-col gap-3 py-4"
    >
      <div className="flex w-full items-center justify-between">
        {/* Spacer to keep the wordmark visually centred on desktop */}
        <div className="hidden w-10 md:block" aria-hidden="true" />
        <div className="text-center">
          <HeaderWordmark site={site} logoMode={config.logoMode} />
        </div>
        <div className="flex items-center gap-2">
          {config.showSearch && <HeaderSearch label={searchLabel} />}
          <HeaderMobile
            nav={nav}
            appearance={tokens.appearance}
            searchLabel={searchLabel}
            direction={site.direction}
          />
        </div>
      </div>
      <HeaderNav
        nav={nav}
        alignment="center"
        ariaLabel={navLabel}
        className="w-full border-t pt-2"
      />
    </HeaderShell>
  );
}

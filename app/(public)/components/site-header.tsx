import type { SiteDefinition } from "@/config/site-definition";
import type { Presentation } from "@/config/presentation";
import { HEADER_VARIANTS } from "./header/registry";
import { resolveNav } from "./header/header-primitives";

interface SiteHeaderProps {
  site: SiteDefinition;
  /** Optional dynamic nav items from DB (overrides site.nav if provided). */
  dbNavItems?: { label: string; href: string; icon?: string }[];
  /**
   * Fully-resolved presentation (variant + config + tokens) from the public
   * layout. The header does not re-read the DB — it just renders the selected
   * variant with the validated config.
   */
  presentation: Presentation;
}

/**
 * Dispatches to the registered header variant. Every LayoutVariant has an
 * entry in HEADER_VARIANTS, so magazine/minimal/directory render their own
 * design instead of silently falling back to standard.
 */
export function SiteHeader({ site, dbNavItems, presentation }: SiteHeaderProps) {
  const nav = resolveNav(site, dbNavItems);
  const Variant = HEADER_VARIANTS[presentation.headerVariant];
  const navLabel = site.language === "ar" ? "التنقل" : "Main navigation";
  const searchLabel = site.language === "ar" ? "بحث" : "Search";

  return (
    <Variant
      site={site}
      nav={nav}
      config={presentation.header}
      tokens={presentation.headerTokens}
      searchLabel={searchLabel}
      navLabel={navLabel}
    />
  );
}

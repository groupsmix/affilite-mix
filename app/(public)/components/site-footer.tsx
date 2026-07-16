import type { SiteDefinition, LayoutVariant } from "@/config/site-definition";
import type { FooterConfig } from "@/config/presentation";
import { DEFAULT_FOOTER_CONFIG } from "@/config/presentation";
import { FOOTER_VARIANTS } from "./footer/registry";

interface SiteFooterProps {
  site: SiteDefinition;
  /** When true, skip the newsletter section (e.g. the page already renders one). */
  hideNewsletter?: boolean;
  /** Optional dynamic footer nav items from DB (renders as a flat list alongside config nav) */
  dbFooterNav?: { label: string; href: string; icon?: string }[];
  /**
   * Resolved footer variant — independent of the header variant. Passed from
   * the public layout so footers don't need to re-read the DB.
   */
  footerVariant?: LayoutVariant;
  /** Validated footer options (newsletter visibility, container width). */
  config?: FooterConfig;
}

export function SiteFooter({
  site,
  hideNewsletter,
  dbFooterNav,
  footerVariant = "standard",
  config = DEFAULT_FOOTER_CONFIG,
}: SiteFooterProps) {
  const Variant = FOOTER_VARIANTS[footerVariant];
  return (
    <Variant
      site={site}
      hideNewsletter={hideNewsletter}
      dbFooterNav={dbFooterNav}
      config={config}
    />
  );
}

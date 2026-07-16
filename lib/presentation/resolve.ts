/**
 * Assemble a fully-resolved, validated {@link Presentation} for a site by
 * layering, in increasing precedence:
 *   defaults → per-variant defaults → static site config → DB override
 *
 * The DB source is whatever presentation record applies to the site (the
 * `sites.theme` blob in Phase 1, the dedicated `site_presentations` record in
 * Phase 2). Every layer runs through the same validators so a hostile or
 * malformed DB value can only ever narrow to a safe default.
 */
import type { SiteDefinition } from "@/config/site-definition";
import {
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_HEADER_TOKENS,
  type Presentation,
} from "@/config/presentation";
import { resolveFooterVariant, resolveHeaderVariant } from "@/lib/layout-variant";
import { resolveFooterConfig, resolveHeaderConfig, resolveHeaderTokens } from "./header-config";
import { VARIANT_HEADER_DEFAULTS, VARIANT_HEADER_TOKEN_DEFAULTS } from "./variant-defaults";

/** Untrusted presentation fields as read from a DB record. */
export interface PresentationSource {
  headerVariant?: string | null;
  footerVariant?: string | null;
  layoutVariant?: string | null;
  headerConfig?: unknown;
  footerConfig?: unknown;
  headerTokens?: unknown;
}

type PresentationSite = Pick<
  SiteDefinition,
  | "layoutVariant"
  | "headerVariant"
  | "footerVariant"
  | "headerConfig"
  | "footerConfig"
  | "headerTokens"
>;

export function resolvePresentation(
  site: PresentationSite,
  db: PresentationSource | null = null,
): Presentation {
  const headerVariant = resolveHeaderVariant({
    dbHeaderVariant: db?.headerVariant,
    dbLayoutVariant: db?.layoutVariant,
    configHeaderVariant: site.headerVariant,
    configLayoutVariant: site.layoutVariant,
  });
  const footerVariant = resolveFooterVariant({
    dbFooterVariant: db?.footerVariant,
    dbLayoutVariant: db?.layoutVariant,
    configFooterVariant: site.footerVariant,
    configLayoutVariant: site.layoutVariant,
  });

  const variantHeaderBase = resolveHeaderConfig(
    VARIANT_HEADER_DEFAULTS[headerVariant],
    DEFAULT_HEADER_CONFIG,
  );
  const configHeader = resolveHeaderConfig(site.headerConfig ?? {}, variantHeaderBase);
  const header = resolveHeaderConfig(db?.headerConfig ?? {}, configHeader);

  const configFooter = resolveFooterConfig(site.footerConfig ?? {}, DEFAULT_FOOTER_CONFIG);
  const footer = resolveFooterConfig(db?.footerConfig ?? {}, configFooter);

  const variantTokenBase = resolveHeaderTokens(
    VARIANT_HEADER_TOKEN_DEFAULTS[headerVariant],
    DEFAULT_HEADER_TOKENS,
  );
  const configTokens = resolveHeaderTokens(site.headerTokens ?? {}, variantTokenBase);
  const headerTokens = resolveHeaderTokens(db?.headerTokens ?? {}, configTokens);

  return { headerVariant, footerVariant, header, footer, headerTokens };
}

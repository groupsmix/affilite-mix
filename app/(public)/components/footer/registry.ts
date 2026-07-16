/**
 * Footer variant registry. Mirrors the header registry: the
 * `Record<LayoutVariant, ...>` type makes it exhaustive, so adding a new
 * variant to the LayoutVariant union is a compile error until a component is
 * registered here — footers can never silently fall back to "standard" again.
 */
import type { JSX } from "react";
import type { LayoutVariant } from "@/config/site-definition";
import type { FooterVariantProps } from "./footer-primitives";
import {
  CompareFooter,
  DirectoryFooter,
  MagazineFooter,
  MinimalFooter,
  StandardFooter,
} from "./footer-variants";

export const FOOTER_VARIANTS: Record<LayoutVariant, (props: FooterVariantProps) => JSX.Element> = {
  standard: StandardFooter,
  compare: CompareFooter,
  magazine: MagazineFooter,
  minimal: MinimalFooter,
  directory: DirectoryFooter,
};

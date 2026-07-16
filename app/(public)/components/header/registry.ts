/**
 * Header variant registry. The `Record<LayoutVariant, ...>` type makes this
 * exhaustive: adding a new variant to the LayoutVariant union is a compile
 * error until a component is registered here, so variants can never silently
 * fall back to "standard" again.
 */
import type { JSX } from "react";
import type { LayoutVariant } from "@/config/site-definition";
import type { HeaderVariantProps } from "./header-variants";
import {
  CompareHeader,
  DirectoryHeader,
  MagazineHeader,
  MinimalHeader,
  StandardHeader,
} from "./header-variants";

export const HEADER_VARIANTS: Record<LayoutVariant, (props: HeaderVariantProps) => JSX.Element> = {
  standard: StandardHeader,
  compare: CompareHeader,
  magazine: MagazineHeader,
  minimal: MinimalHeader,
  directory: DirectoryHeader,
};

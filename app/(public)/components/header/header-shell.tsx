/**
 * The chrome wrapper shared by every header variant: applies the resolved
 * design tokens as scoped CSS custom properties, renders the optional
 * announcement bar and category strip, and owns the sticky/border behaviour.
 * Variants only supply the contents of the main bar.
 */
import type { ReactNode } from "react";
import type { HeaderConfig, HeaderTokens } from "@/config/presentation";
import { cn } from "@/lib/utils";
import { headerCssVars } from "@/lib/presentation/header-style";
import { AnnouncementBar, CategoryStrip } from "./header-primitives";

export function HeaderShell({
  tokens,
  config,
  widthClass,
  children,
  barClassName,
  topAccentStripe = false,
  flush = false,
}: {
  tokens: HeaderTokens;
  config: HeaderConfig;
  widthClass: string;
  children: ReactNode;
  barClassName?: string;
  topAccentStripe?: boolean;
  /** Borderless, shadowless treatment (minimal variant). */
  flush?: boolean;
}) {
  return (
    <div style={headerCssVars(tokens)}>
      <AnnouncementBar config={config.announcement} />
      <header
        className={cn(config.sticky && "sticky top-0 z-40", !flush && "shadow-sm")}
        style={{ backgroundColor: "var(--header-bg)", color: "var(--header-fg)" }}
      >
        {topAccentStripe && (
          <div
            className="h-0.5 w-full"
            style={{ backgroundColor: "var(--header-accent)" }}
            aria-hidden="true"
          />
        )}
        <div
          className={cn(
            "mx-auto flex items-center gap-4 px-4",
            tokens.height ? "min-h-[var(--header-height)] py-2" : "py-3",
            widthClass,
            barClassName,
          )}
        >
          {children}
        </div>
        {config.categoryStrip.enabled && (
          <CategoryStrip items={config.categoryStrip.items} widthClass={widthClass} />
        )}
        {!flush && (
          <div
            className="h-px w-full"
            style={{ backgroundColor: "var(--header-border)" }}
            aria-hidden="true"
          />
        )}
      </header>
    </div>
  );
}

import type { CSSProperties } from "react";
import type { HeaderTokens } from "@/config/presentation";
import { resolveFontFamily } from "./fonts";

/**
 * Build the header-scoped CSS custom properties from validated design tokens.
 * Null tokens inherit from the global theme (or an appearance-appropriate
 * default), so a site that only overrides one token still gets a coherent
 * header. All values originate from `resolveHeaderTokens`, which rejects any
 * CSS-injection vector, so they are safe to place in an inline style.
 */
export function headerCssVars(tokens: HeaderTokens): CSSProperties {
  const dark = tokens.appearance === "dark";
  const vars: Record<string, string> = {
    "--header-bg": tokens.background ?? (dark ? "var(--color-primary, #1e293b)" : "#ffffff"),
    "--header-fg": tokens.foreground ?? (dark ? "#ffffff" : "#111827"),
    "--header-fg-muted": dark ? "rgba(255,255,255,0.72)" : "#4b5563",
    "--header-accent": tokens.accent ?? "var(--color-accent, #3b82f6)",
    "--header-border": tokens.border ?? (dark ? "rgba(255,255,255,0.12)" : "#e5e7eb"),
    "--header-hover": dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)",
    "--header-font": tokens.fontFamily
      ? resolveFontFamily(tokens.fontFamily)
      : "var(--font-heading)",
  };
  if (tokens.height) vars["--header-height"] = tokens.height;
  return vars as CSSProperties;
}

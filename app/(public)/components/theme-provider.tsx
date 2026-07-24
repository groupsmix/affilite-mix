"use client";

import { createContext, useMemo } from "react";
import type { LayoutVariant } from "@/config/site-definition";

// Re-export so existing imports of LayoutVariant from this file keep working.
export type { LayoutVariant };

/* ------------------------------------------------------------------ */
/*  Theme types                                                         */
/* ------------------------------------------------------------------ */

export interface SiteThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  accentTextColor: string;
  accentLightColor: string;
  fontFamily: string;
  fontHeading: string;
  fontBody: string;
  layoutVariant: LayoutVariant;
  /** Optional dark editorial theme used by the dial watch homepage. */
  mode?: "light" | "dark" | "dial";
}

const defaultTheme: SiteThemeConfig = {
  primaryColor: "#1e293b",
  secondaryColor: "#3b82f6",
  accentColor: "#10b981",
  accentTextColor: "#059669",
  accentLightColor: "#10b981",
  fontFamily: "Inter, sans-serif",
  fontHeading: "Inter",
  fontBody: "Inter",
  layoutVariant: "standard",
  mode: "light",
};

/**
 * Full token set for the dial/watch editorial dark theme.
 * Applied as inline CSS variables so the theme applies to all wrapped chrome
 * (header, main, footer) without touching the root :root light theme.
 */
const DIAL_TOKENS: Record<string, string> = {
  /* Deep charcoal with a teal accent and soft radius — deliberately not the
   * warm-cream/terracotta, acid-green-on-black, or broadsheet defaults. */
  "--radius": "0.75rem",
  "--background": "oklch(0.14 0.015 235)",
  "--foreground": "oklch(0.96 0.005 90)",
  "--card": "oklch(0.2 0.015 230)",
  "--card-foreground": "oklch(0.96 0.005 90)",
  "--popover": "oklch(0.2 0.015 230)",
  "--popover-foreground": "oklch(0.96 0.005 90)",
  "--primary": "oklch(0.65 0.12 185)",
  "--primary-foreground": "oklch(0.14 0.015 235)",
  "--secondary": "oklch(0.22 0.012 230)",
  "--secondary-foreground": "oklch(0.96 0.005 90)",
  "--muted": "oklch(0.26 0.012 225)",
  "--muted-foreground": "oklch(0.72 0.01 85)",
  "--accent": "oklch(0.65 0.12 185)",
  "--accent-foreground": "oklch(0.14 0.015 235)",
  "--destructive": "oklch(0.58 0.2 27)",
  "--border": "oklch(1 0 0 / 11%)",
  "--input": "oklch(1 0 0 / 14%)",
  "--ring": "oklch(0.65 0.12 185)",

  /* Legacy site-theme tokens consumed by header/footer chrome */
  "--color-primary": "oklch(0.65 0.12 185)",
  "--color-secondary": "oklch(0.22 0.012 230)",
  "--color-accent": "oklch(0.65 0.12 185)",
  "--color-accent-text": "oklch(0.65 0.12 185)",
  "--color-accent-light": "oklch(0.65 0.12 185 / 12%)",
  "--color-background": "oklch(0.14 0.015 235)",
  "--color-foreground": "oklch(0.96 0.005 90)",
  "--color-card": "oklch(0.2 0.015 230)",
  "--color-card-foreground": "oklch(0.96 0.005 90)",
  "--color-popover": "oklch(0.2 0.015 230)",
  "--color-popover-foreground": "oklch(0.96 0.005 90)",
  "--color-primary-foreground": "oklch(0.14 0.015 235)",
  "--color-secondary-foreground": "oklch(0.96 0.005 90)",
  "--color-muted": "oklch(0.26 0.012 225)",
  "--color-muted-foreground": "oklch(0.72 0.01 85)",
  "--color-accent-foreground": "oklch(0.14 0.015 235)",
  "--color-destructive": "oklch(0.58 0.2 27)",
  "--color-border": "oklch(1 0 0 / 11%)",
  "--color-input": "oklch(1 0 0 / 14%)",
  "--color-ring": "oklch(0.65 0.12 185)",
};

const ThemeContext = createContext<SiteThemeConfig>(defaultTheme);

/* ------------------------------------------------------------------ */
/*  ThemeProvider                                                        */
/* ------------------------------------------------------------------ */

interface ThemeProviderProps {
  theme: Partial<SiteThemeConfig>;
  children: React.ReactNode;
}

/**
 * ThemeProvider reads theme config from the site DB record and injects
 * CSS custom properties into a wrapper element. All public-facing components
 * can then use `var(--color-primary)`, `var(--color-secondary)`, etc.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const merged = useMemo<SiteThemeConfig>(() => ({ ...defaultTheme, ...theme }), [theme]);

  const fontMap: Record<string, string> = {
    Inter: "var(--font-inter), sans-serif",
    "IBM Plex Sans Arabic": "var(--font-ibm-plex-arabic), sans-serif",
    "Playfair Display": "var(--font-playfair), serif",
  };

  const fontBody = fontMap[merged.fontBody] ?? `${merged.fontBody}, sans-serif`;
  const fontHeading = fontMap[merged.fontHeading] ?? `${merged.fontHeading}, serif`;

  const baseVars: Record<string, string> = {
    "--color-primary": merged.primaryColor,
    "--color-secondary": merged.secondaryColor,
    "--color-accent": merged.accentColor,
    "--color-accent-text": merged.accentTextColor,
    "--color-accent-light": merged.accentLightColor,
    "--font-family": fontBody,
    "--font-heading": fontHeading,
    "--font-body": fontBody,
  };

  const vars: Record<string, string> =
    merged.mode === "dial"
      ? {
          ...DIAL_TOKENS,
          "--font-heading": fontHeading,
          "--font-body": fontBody,
        }
      : baseVars;

  return (
    <ThemeContext.Provider value={merged}>
      <div
        style={vars as React.CSSProperties}
        data-layout={merged.layoutVariant}
        data-theme={merged.mode === "dial" ? "dial" : undefined}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

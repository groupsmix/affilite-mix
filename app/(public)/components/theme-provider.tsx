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
  "--background": "oklch(0.16 0.006 60)",
  "--foreground": "oklch(0.96 0.006 80)",
  "--card": "oklch(0.2 0.007 60)",
  "--card-foreground": "oklch(0.96 0.006 80)",
  "--popover": "oklch(0.2 0.007 60)",
  "--popover-foreground": "oklch(0.96 0.006 80)",
  "--primary": "oklch(0.8 0.12 82)",
  "--primary-foreground": "oklch(0.2 0.02 70)",
  "--secondary": "oklch(0.26 0.008 60)",
  "--secondary-foreground": "oklch(0.96 0.006 80)",
  "--muted": "oklch(0.24 0.007 60)",
  "--muted-foreground": "oklch(0.72 0.01 75)",
  "--accent": "oklch(0.8 0.12 82)",
  "--accent-foreground": "oklch(0.2 0.02 70)",
  "--destructive": "oklch(0.58 0.2 27)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 14%)",
  "--ring": "oklch(0.8 0.12 82)",

  /* Legacy site-theme tokens consumed by header/footer chrome */
  "--color-primary": "oklch(0.26 0.008 60)",
  "--color-secondary": "oklch(0.26 0.008 60)",
  "--color-accent": "oklch(0.8 0.12 82)",
  "--color-accent-text": "oklch(0.72 0.01 75)",
  "--color-accent-light": "oklch(0.8 0.12 82)",
  "--color-background": "oklch(0.16 0.006 60)",
  "--color-foreground": "oklch(0.96 0.006 80)",
  "--color-card": "oklch(0.2 0.007 60)",
  "--color-card-foreground": "oklch(0.96 0.006 80)",
  "--color-popover": "oklch(0.2 0.007 60)",
  "--color-popover-foreground": "oklch(0.96 0.006 80)",
  "--color-primary-foreground": "oklch(0.2 0.02 70)",
  "--color-secondary-foreground": "oklch(0.96 0.006 80)",
  "--color-muted": "oklch(0.24 0.007 60)",
  "--color-muted-foreground": "oklch(0.72 0.01 75)",
  "--color-accent-foreground": "oklch(0.2 0.02 70)",
  "--color-destructive": "oklch(0.58 0.2 27)",
  "--color-border": "oklch(1 0 0 / 10%)",
  "--color-input": "oklch(1 0 0 / 14%)",
  "--color-ring": "oklch(0.8 0.12 82)",
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

"use client";

import { createContext, useMemo } from "react";
import type { LayoutVariant } from "@/config/site-definition";

// Re-export so existing imports of LayoutVariant from this file keep working.
export type { LayoutVariant };

/* ------------------------------------------------------------------ */
/*  Color utilities                                                      */
/* ------------------------------------------------------------------ */

function getLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getPrimaryForeground(hex: string): string {
  try {
    return getLuminance(hex) > 0.25 ? "#111827" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/* ------------------------------------------------------------------ */
/*  Theme types                                                         */
/* ------------------------------------------------------------------ */

export interface SiteThemeConfig {
  primaryColor: string;
  primaryForeground: string;
  secondaryColor: string;
  accentColor: string;
  accentTextColor: string;
  accentLightColor: string;
  accentForeground: string;
  accentTextForeground: string;
  fontFamily: string;
  fontHeading: string;
  fontBody: string;
  layoutVariant: LayoutVariant;
}

const defaultTheme: SiteThemeConfig = {
  primaryColor: "#1e293b",
  primaryForeground: "#ffffff",
  secondaryColor: "#3b82f6",
  accentColor: "#10b981",
  accentTextColor: "#059669",
  accentLightColor: "#10b981",
  accentForeground: "#ffffff",
  accentTextForeground: "#ffffff",
  fontFamily: "Inter, sans-serif",
  fontHeading: "Inter",
  fontBody: "Inter",
  layoutVariant: "standard",
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
  const merged = useMemo<SiteThemeConfig>(() => {
    const t = { ...defaultTheme, ...theme };
    // Always derive accessible foregrounds from the chosen colors unless an
    // explicit override is provided in the incoming theme partial.
    t.primaryForeground = theme.primaryForeground ?? getPrimaryForeground(t.primaryColor);
    t.accentForeground = theme.accentForeground ?? getPrimaryForeground(t.accentColor);
    t.accentTextForeground = theme.accentTextForeground ?? getPrimaryForeground(t.accentTextColor);
    return t;
  }, [theme]);

  const fontMap: Record<string, string> = {
    Inter: "var(--font-inter), sans-serif",
    "IBM Plex Sans Arabic": "var(--font-ibm-plex-arabic), sans-serif",
    "Playfair Display": "var(--font-playfair), serif",
  };

  const cssVars = {
    "--color-primary": merged.primaryColor,
    "--color-primary-foreground": merged.primaryForeground,
    "--color-secondary": merged.secondaryColor,
    "--color-accent": merged.accentColor,
    "--color-accent-text": merged.accentTextColor,
    "--color-accent-light": merged.accentLightColor,
    "--color-accent-foreground": merged.accentForeground,
    "--color-accent-text-foreground": merged.accentTextForeground,
    "--font-family": fontMap[merged.fontBody] ?? `${merged.fontBody}, sans-serif`,
    "--font-heading": fontMap[merged.fontHeading] ?? `${merged.fontHeading}, serif`,
    "--font-body": fontMap[merged.fontBody] ?? `${merged.fontBody}, sans-serif`,
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={merged}>
      <div style={cssVars} data-layout={merged.layoutVariant}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

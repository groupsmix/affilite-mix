"use client";

import { createContext, useContext, useMemo } from "react";
import { sanitizeCss } from "@/lib/sanitize-html";

/* ------------------------------------------------------------------ */
/*  Layout variants                                                     */
/* ------------------------------------------------------------------ */

export type LayoutVariant = "standard" | "magazine" | "minimal" | "directory";

/* ------------------------------------------------------------------ */
/*  Theme types                                                         */
/* ------------------------------------------------------------------ */

export interface SiteThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  accentTextColor: string;
  fontFamily: string;
  fontHeading: string;
  fontBody: string;
  layoutVariant: LayoutVariant;
  customCss?: string | null;
}

const defaultTheme: SiteThemeConfig = {
  primaryColor: "#1e293b",
  secondaryColor: "#3b82f6",
  accentColor: "#10b981",
  accentTextColor: "#10b981",
  fontFamily: "Inter, sans-serif",
  fontHeading: "Inter",
  fontBody: "Inter",
  layoutVariant: "standard",
  customCss: null,
};

const ThemeContext = createContext<SiteThemeConfig>(defaultTheme);

export function useTheme(): SiteThemeConfig {
  return useContext(ThemeContext);
}

/* ------------------------------------------------------------------ */
/*  ThemeProvider                                                        */
/* ------------------------------------------------------------------ */

interface ThemeProviderProps {
  theme: Partial<SiteThemeConfig>;
  children: React.ReactNode;
  /**
   * Per-request CSP nonce — applied to the inline `<style>` tag that holds
   * the site's custom CSS so `style-src 'unsafe-inline'` can be removed
   * (H-10).  Supplied by the public layout after reading `x-nonce` from
   * middleware-set request headers.
   */
  nonce?: string;
}

/**
 * ThemeProvider reads theme config from the site DB record and injects
 * CSS custom properties into a wrapper element. All public-facing components
 * can then use `var(--color-primary)`, `var(--color-secondary)`, etc.
 */
export function ThemeProvider({ theme, children, nonce }: ThemeProviderProps) {
  const merged = useMemo<SiteThemeConfig>(() => ({ ...defaultTheme, ...theme }), [theme]);

  const fontMap: Record<string, string> = {
    Inter: "var(--font-inter), sans-serif",
    "IBM Plex Sans Arabic": "var(--font-ibm-plex-arabic), sans-serif",
    "Playfair Display": "var(--font-playfair), serif",
  };

  const cssVars = {
    "--color-primary": merged.primaryColor,
    "--color-secondary": merged.secondaryColor,
    "--color-accent": merged.accentColor,
    "--color-accent-text": merged.accentTextColor,
    "--font-family": fontMap[merged.fontBody] ?? `${merged.fontBody}, sans-serif`,
    "--font-heading": fontMap[merged.fontHeading] ?? `${merged.fontHeading}, serif`,
    "--font-body": fontMap[merged.fontBody] ?? `${merged.fontBody}, sans-serif`,
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={merged}>
      <div style={cssVars} data-layout={merged.layoutVariant}>
        {merged.customCss && (
          <style
            nonce={nonce}
            dangerouslySetInnerHTML={{ __html: sanitizeCss(merged.customCss!) }}
          />
        )}
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

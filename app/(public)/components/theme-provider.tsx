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
  mode?: "light" | "dark" | "dial" | "calmroutine";
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
 * Full token set for the WristNerd editorial light theme.
 * Warm off-white background, dark navy primary, and a teal accent.
 */
const DIAL_TOKENS: Record<string, string> = {
  "--radius": "0.75rem",
  "--background": "#fbf9f4",
  "--foreground": "#1b1c19",
  "--card": "#ffffff",
  "--card-foreground": "#1b1c19",
  "--popover": "#ffffff",
  "--popover-foreground": "#1b1c19",
  "--primary": "#182232",
  "--primary-foreground": "#ffffff",
  "--secondary": "#f0eee9",
  "--secondary-foreground": "#1b1c19",
  "--muted": "#f5f3ee",
  "--muted-foreground": "#5f5e5a",
  "--accent": "#2A9D8F",
  "--accent-foreground": "#ffffff",
  "--destructive": "#ba1a1a",
  "--border": "rgba(27, 28, 25, 0.08)",
  "--input": "rgba(27, 28, 25, 0.08)",
  "--ring": "#2A9D8F",

  /* Legacy site-theme tokens consumed by header/footer chrome */
  "--color-primary": "#182232",
  "--color-secondary": "#f0eee9",
  "--color-accent": "#2A9D8F",
  "--color-accent-text": "#2A9D8F",
  "--color-accent-light": "rgba(42, 157, 143, 0.12)",
  "--color-background": "#fbf9f4",
  "--color-foreground": "#1b1c19",
  "--color-card": "#ffffff",
  "--color-card-foreground": "#1b1c19",
  "--color-popover": "#ffffff",
  "--color-popover-foreground": "#1b1c19",
  "--color-primary-foreground": "#ffffff",
  "--color-secondary-foreground": "#1b1c19",
  "--color-muted": "#f5f3ee",
  "--color-muted-foreground": "#5f5e5a",
  "--color-accent-foreground": "#ffffff",
  "--color-destructive": "#ba1a1a",
  "--color-border": "rgba(27, 28, 25, 0.08)",
  "--color-input": "rgba(27, 28, 25, 0.08)",
  "--color-ring": "#2A9D8F",
};

/**
 * Full token set for the calmroutine wellness site.
 * Warm off-white background, deep teal primary, and a mid-teal accent.
 * Avoids the AI-slop warm-cream/terracotta, acid-green-on-black, and
 * broadsheet hairline defaults.
 */
const CALMROUTINE_TOKENS: Record<string, string> = {
  "--radius": "0.75rem",
  "--background": "#FAF9F6",
  "--foreground": "#2C2C2A",
  "--card": "#FFFFFF",
  "--card-foreground": "#2C2C2A",
  "--popover": "#FFFFFF",
  "--popover-foreground": "#2C2C2A",
  "--primary": "#085041",
  "--primary-foreground": "#FAF9F6",
  "--secondary": "#E1F5EE",
  "--secondary-foreground": "#085041",
  "--muted": "#F5F3EE",
  "--muted-foreground": "#5F5E5A",
  "--accent": "#1D9E75",
  "--accent-foreground": "#FAF9F6",
  "--destructive": "#B42318",
  "--border": "rgba(0, 0, 0, 0.08)",
  "--input": "rgba(0, 0, 0, 0.08)",
  "--ring": "#1D9E75",

  /* Legacy/convenience tokens consumed by calmroutine components */
  "--color-primary": "#085041",
  "--color-secondary": "#E1F5EE",
  "--color-accent": "#1D9E75",
  "--color-accent-text": "#085041",
  "--color-accent-light": "#E1F5EE",
  "--color-background": "#FAF9F6",
  "--color-foreground": "#2C2C2A",
  "--color-card": "#FFFFFF",
  "--color-card-foreground": "#2C2C2A",
  "--color-popover": "#FFFFFF",
  "--color-popover-foreground": "#2C2C2A",
  "--color-primary-foreground": "#FAF9F6",
  "--color-secondary-foreground": "#085041",
  "--color-muted": "#F5F3EE",
  "--color-muted-foreground": "#5F5E5A",
  "--color-accent-foreground": "#FAF9F6",
  "--color-destructive": "#B42318",
  "--color-border": "rgba(0, 0, 0, 0.08)",
  "--color-input": "rgba(0, 0, 0, 0.08)",
  "--color-ring": "#1D9E75",
  "--color-accent-tint": "#E1F5EE",
  "--color-accent-mid": "#1D9E75",
  "--color-accent-dark": "#085041",
  "--color-text-primary": "#2C2C2A",
  "--color-text-secondary": "#5F5E5A",
  "--color-bg": "#FAF9F6",
  "--color-border-subtle": "rgba(0, 0, 0, 0.08)",
  "--color-cat-routine-bg": "#E1F5EE",
  "--color-cat-routine-text": "#085041",
  "--color-cat-somatic-bg": "#F7ECD9",
  "--color-cat-somatic-text": "#7A5514",
  "--color-cat-reviews-bg": "#ECE7F5",
  "--color-cat-reviews-text": "#4A3A72",
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
    Fraunces: "var(--font-fraunces), Georgia, serif",
    "Public Sans": "var(--font-public-sans), 'Work Sans', sans-serif",
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
      : merged.mode === "calmroutine"
        ? {
            ...CALMROUTINE_TOKENS,
            "--font-heading": fontHeading,
            "--font-body": fontBody,
          }
        : baseVars;

  return (
    <ThemeContext.Provider value={merged}>
      <div
        style={vars as React.CSSProperties}
        data-layout={merged.layoutVariant}
        data-theme={
          merged.mode === "dial"
            ? "dial"
            : merged.mode === "calmroutine"
              ? "calmroutine"
              : undefined
        }
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

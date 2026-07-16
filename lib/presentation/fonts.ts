/**
 * Maps a theme/token font-family name to the CSS custom property stack loaded
 * by the app. Kept in sync with the font map in the ThemeProvider so header
 * design tokens resolve to the same web fonts as the rest of the site.
 */
const FONT_MAP: Record<string, string> = {
  Inter: "var(--font-inter), sans-serif",
  "IBM Plex Sans Arabic": "var(--font-ibm-plex-arabic), sans-serif",
  "Playfair Display": "var(--font-playfair), serif",
};

export function resolveFontFamily(name: string): string {
  return FONT_MAP[name] ?? `${name}, sans-serif`;
}

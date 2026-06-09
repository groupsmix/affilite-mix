/**
 * #23 regression locks for dark mode wiring.
 *
 * These tests validate the source-level contract between the pre-hydration
 * bootstrap script, the public toggle component, and Tailwind v4 dark tokens.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");

function readFile(...parts: string[]): string {
  return fs.readFileSync(path.join(REPO_ROOT, ...parts), "utf8");
}

function extractBootstrapScript(): string {
  const layout = readFile("app", "layout.tsx");
  const match = layout.match(/__html:\s*`([^`]+)`/);
  expect(match, "theme bootstrap __html literal not found").not.toBeNull();
  return match![1]!;
}

describe("#23 dark mode bootstrap script", () => {
  const layout = readFile("app", "layout.tsx");
  const script = extractBootstrapScript();

  it("uses a nonced inline script before body render", () => {
    expect(layout).toContain("dangerouslySetInnerHTML");
    expect(layout).toMatch(/nonce=\{nonce\}/);
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("reads the shared theme-preference key and applies the dark class", () => {
    expect(script).toContain('localStorage.getItem("theme-preference")');
    expect(script).toContain('classList.add("dark")');
    expect(script).toContain("prefers-color-scheme:dark");
  });

  it.each([
    { stored: "dark", systemDark: false, expected: true },
    { stored: "dark", systemDark: true, expected: true },
    { stored: "light", systemDark: false, expected: false },
    { stored: "light", systemDark: true, expected: false },
    { stored: "system", systemDark: false, expected: false },
    { stored: "system", systemDark: true, expected: true },
    { stored: null, systemDark: false, expected: false },
    { stored: null, systemDark: true, expected: true },
  ])(
    "resolves stored=$stored systemDark=$systemDark to dark=$expected",
    ({ stored, systemDark, expected }) => {
      const add = vi.fn();
      const localStorage = { getItem: vi.fn(() => stored) };
      const matchMedia = vi.fn(() => ({ matches: systemDark }));
      const document = { documentElement: { classList: { add } } };

      new Function("localStorage", "matchMedia", "document", script)(
        localStorage,
        matchMedia,
        document,
      );

      if (expected) expect(add).toHaveBeenCalledWith("dark");
      else expect(add).not.toHaveBeenCalled();
    },
  );

  it("fails closed if localStorage throws", () => {
    const add = vi.fn();
    const localStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const matchMedia = vi.fn(() => ({ matches: true }));
    const document = { documentElement: { classList: { add } } };

    expect(() =>
      new Function("localStorage", "matchMedia", "document", script)(
        localStorage,
        matchMedia,
        document,
      ),
    ).not.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("#23 dark mode toggle component", () => {
  const toggle = readFile("app", "(public)", "components", "dark-mode-toggle.tsx");

  it("uses the same storage key and three-state cycle order", () => {
    expect(toggle).toContain('const STORAGE_KEY = "theme-preference"');
    expect(toggle).toContain('["light", "dark", "system"]');
  });

  it("toggles the html.dark class and persists user choice", () => {
    expect(toggle).toContain("document.documentElement.classList.toggle");
    expect(toggle).toContain("localStorage.setItem(STORAGE_KEY, next!)");
  });

  it("listens for system preference changes and cleans up the listener", () => {
    expect(toggle).toContain("prefers-color-scheme: dark");
    expect(toggle).toContain("mql.addEventListener");
    expect(toggle).toContain("mql.removeEventListener");
  });

  it("uses a mounted guard to avoid hydration mismatch", () => {
    expect(toggle).toContain("setMounted(true)");
    expect(toggle).toContain("if (!mounted)");
  });
});

describe("#23 dark mode CSS", () => {
  const css = readFile("app", "globals.css");

  it("defines the Tailwind v4 dark variant", () => {
    expect(css).toContain("@custom-variant dark");
    expect(css).toContain(".dark *");
  });

  it("defines dark-mode design tokens", () => {
    expect(css).toMatch(/\.dark\s*\{[^}]*--background:/);
    expect(css).toMatch(/\.dark\s*\{[^}]*--foreground:/);
    expect(css).toMatch(/\.dark\s*\{[^}]*--card:/);
    expect(css).toMatch(/\.dark\s*\{[^}]*--muted-foreground:/);
  });

  it("defines a dark-mode focus-visible rule", () => {
    expect(css).toContain(".dark :focus-visible");
  });
});

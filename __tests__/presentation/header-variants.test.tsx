/**
 * @vitest-environment jsdom
 *
 * Structural / a11y coverage for every registered header variant. We render
 * each variant to its first-paint markup (renderToString, no effects) — the
 * same strategy as audit16-frontend-a11y.test.tsx — and assert the shared
 * accessible primitives, config-driven affordances, active nav state, long
 * navigation, and RTL rendering all hold across designs.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href?: unknown; children?: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/reviews" }));

import { HEADER_VARIANTS } from "@/app/(public)/components/header/registry";
import type { HeaderVariantProps } from "@/app/(public)/components/header/header-variants";
import { DEFAULT_HEADER_CONFIG, DEFAULT_HEADER_TOKENS } from "@/config/presentation";
import type { SiteDefinition, NavItem } from "@/config/site-definition";
import type { HeaderConfig } from "@/config/presentation";

const VARIANTS = ["standard", "compare", "magazine", "minimal", "directory"] as const;

const NAV: NavItem[] = [
  { title: "Home", href: "/" },
  { title: "Reviews", href: "/reviews" },
  { title: "Guides", href: "/guides" },
];

function makeSite(overrides: Partial<SiteDefinition> = {}): SiteDefinition {
  return {
    id: "s1",
    name: "Wrist Nerd",
    domain: "wristnerd.test",
    language: "en",
    direction: "ltr",
    nav: NAV,
    brand: { niche: "watches", logo: "", faviconUrl: "" },
    theme: {
      primaryColor: "#111",
      accentColor: "#3b82f6",
      accentTextColor: "#fff",
      accentLightColor: "#eff6ff",
      fontHeading: "Inter",
      fontBody: "Inter",
    },
  } as unknown as SiteDefinition;
}

function props(
  overrides: {
    config?: Partial<HeaderConfig>;
    site?: Partial<SiteDefinition>;
    nav?: NavItem[];
  } = {},
): HeaderVariantProps {
  return {
    site: makeSite(overrides.site),
    nav: overrides.nav ?? NAV,
    config: { ...DEFAULT_HEADER_CONFIG, ...overrides.config },
    tokens: DEFAULT_HEADER_TOKENS,
    searchLabel: "Search",
    navLabel: "Primary",
  };
}

function render(variant: (typeof VARIANTS)[number], p: HeaderVariantProps): string {
  return renderToString(HEADER_VARIANTS[variant](p));
}

describe("header variants — shared primitives", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: renders a labelled nav landmark and brand link`, () => {
      const html = render(variant, props());
      expect(html).toContain('aria-label="Primary"');
      expect(html).toContain('aria-label="Wrist Nerd"'); // wordmark link
      expect(html).toContain("Reviews");
    });

    it(`${variant}: honours showSearch`, () => {
      expect(render(variant, props({ config: { showSearch: true } }))).toContain(
        'aria-label="Search"',
      );
      expect(render(variant, props({ config: { showSearch: false } }))).not.toContain(
        'aria-label="Search"',
      );
    });

    it(`${variant}: marks the active nav item with aria-current`, () => {
      // usePathname is mocked to "/reviews"
      expect(render(variant, props())).toContain('aria-current="page"');
    });

    it(`${variant}: renders a long navigation list in full`, () => {
      const longNav: NavItem[] = Array.from({ length: 12 }, (_, i) => ({
        title: `Section ${i}`,
        href: `/s${i}`,
      }));
      const html = render(variant, props({ nav: longNav }));
      expect(html).toContain("Section 0");
      expect(html).toContain("Section 11");
    });

    it(`${variant}: renders under RTL without throwing`, () => {
      expect(() => render(variant, props({ site: { direction: "rtl" } }))).not.toThrow();
    });
  }
});

describe("header variants — config-driven affordances", () => {
  it("renders the CTA when showCta is enabled", () => {
    const html = render("compare", props({ config: { showCta: true, ctaLabel: "Compare" } }));
    expect(html).toContain("Compare");
  });

  it("renders the announcement bar when enabled", () => {
    const html = render(
      "standard",
      props({ config: { announcement: { enabled: true, text: "Big sale", href: null } } }),
    );
    expect(html).toContain("Big sale");
    expect(html).toContain('aria-label="Announcement"');
  });

  it("renders the category strip when enabled", () => {
    const html = render(
      "directory",
      props({
        config: {
          categoryStrip: {
            enabled: true,
            items: [
              { label: "Divers", href: "/divers" },
              { label: "Chronographs", href: "/chrono" },
            ],
          },
        },
      }),
    );
    expect(html).toContain('aria-label="Categories"');
    expect(html).toContain("Divers");
    expect(html).toContain("Chronographs");
  });
});

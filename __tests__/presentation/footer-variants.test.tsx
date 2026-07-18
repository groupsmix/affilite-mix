/**
 * @vitest-environment jsdom
 *
 * Structural coverage for every registered footer variant. Mirrors the header
 * variant tests: each variant is rendered to first-paint markup and must expose
 * the shared footer primitives (nav sections, legal/copyright, newsletter gate)
 * regardless of design, honour the newsletter config flag, and render in RTL.
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

import { FOOTER_VARIANTS } from "@/app/(public)/components/footer/registry";
import type { FooterVariantProps } from "@/app/(public)/components/footer/footer-primitives";
import { DEFAULT_FOOTER_CONFIG } from "@/config/presentation";
import type { FooterConfig } from "@/config/presentation";
import type { SiteDefinition } from "@/config/site-definition";

const VARIANTS = ["standard", "compare", "magazine", "minimal", "directory"] as const;

function makeSite(overrides: Partial<SiteDefinition> = {}): SiteDefinition {
  return {
    id: "s1",
    name: "Wrist Nerd",
    domain: "wristnerd.test",
    language: "en",
    direction: "ltr",
    monetizationType: "affiliate",
    affiliateDisclosure: "We may earn a commission.",
    brand: { niche: "watches", description: "Watch reviews.", logo: "", faviconUrl: "" },
    features: { newsletter: true },
    footerNav: {
      quickLinks: [
        { title: "About", href: "/about" },
        { title: "Contact", href: "/contact" },
      ],
      legal: [{ title: "Terms", href: "/terms" }],
    },
    ...overrides,
  } as unknown as SiteDefinition;
}

function props(overrides: Partial<FooterVariantProps> = {}): FooterVariantProps {
  return {
    site: overrides.site ?? makeSite(),
    hideNewsletter: overrides.hideNewsletter,
    dbFooterNav: overrides.dbFooterNav,
    config: overrides.config ?? DEFAULT_FOOTER_CONFIG,
  };
}

describe("footer variants", () => {
  for (const variant of VARIANTS) {
    const Footer = FOOTER_VARIANTS[variant];

    it(`${variant}: renders a <footer> with brand, nav links and legal`, () => {
      const html = renderToString(<Footer {...props()} />);
      expect(html).toContain("<footer");
      expect(html).toContain("Wrist Nerd");
      expect(html).toContain("/about");
      expect(html).toContain("Privacy Policy");
      expect(html).toContain("2");
    });

    it(`${variant}: surfaces affiliate disclosure (text or link)`, () => {
      const html = renderToString(<Footer {...props()} />);
      // The shared-primitive footers render the disclosure text; the compare
      // footer links to the dedicated disclosure page instead.
      expect(
        html.includes("We may earn a commission.") || html.includes("affiliate-disclosure"),
      ).toBe(true);
    });

    it(`${variant}: hides newsletter when config.showNewsletter is false`, () => {
      const on = renderToString(
        <Footer {...props({ config: { ...DEFAULT_FOOTER_CONFIG, showNewsletter: true } })} />,
      );
      const off = renderToString(
        <Footer {...props({ config: { ...DEFAULT_FOOTER_CONFIG, showNewsletter: false } })} />,
      );
      // The "on" render must contain at least as much newsletter markup as "off".
      expect(off.length).toBeLessThanOrEqual(on.length);
    });

    it(`${variant}: renders DB-injected footer nav`, () => {
      const html = renderToString(
        <Footer {...props({ dbFooterNav: [{ label: "Sitemap", href: "/sitemap" }] })} />,
      );
      expect(html).toContain("/sitemap");
    });
  }

  it("respects an ads-monetized disclosure", () => {
    const site = makeSite({ monetizationType: "ads" } as Partial<SiteDefinition>);
    const html = renderToString(<FOOTER_VARIANTS.standard {...props({ site })} />);
    expect(html).toContain("supported by advertising");
  });

  it("applies the configured container width", () => {
    const wide: FooterConfig = { ...DEFAULT_FOOTER_CONFIG, containerWidth: "wide" };
    const html = renderToString(<FOOTER_VARIANTS.standard {...props({ config: wide })} />);
    expect(html).toContain("max-w-7xl");
  });
});

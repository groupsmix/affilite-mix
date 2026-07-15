import { describe, expect, it } from "vitest";
import { allSites } from "@/config/sites";
import {
  buildAdminSiteRegistry,
  isStaticConfigSite,
  isStaticConfigSiteSlug,
} from "@/lib/site-config-authority";
import type { SiteRow } from "@/types/database";

function siteRow(overrides: Partial<SiteRow> = {}): SiteRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "database-only",
    name: "Database Only",
    domain: "database.example",
    language: "en",
    direction: "ltr",
    is_active: true,
    monetization_type: "affiliate",
    est_revenue_per_click: 0.25,
    ad_config: {},
    theme: { primaryColor: "#111111" },
    logo_url: null,
    favicon_url: null,
    nav_items: [],
    footer_nav: [],
    features: { deals: true },
    meta_title: "Database title",
    meta_description: "Database description",
    og_image_url: null,
    social_links: {},
    homepage_template: "standard",
    product_card_style: "standard",
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("site configuration authority", () => {
  it("keeps a provisioned static tenant code-authoritative", () => {
    const configSite = allSites[0]!;
    const registry = buildAdminSiteRegistry([
      siteRow({
        slug: configSite.id,
        name: "Changed in database",
        domain: "wrong.example",
        is_active: false,
      }),
    ]);

    const result = registry.find((site) => site.slug === configSite.id);

    expect(result).toMatchObject({
      name: configSite.name,
      domain: configSite.domain,
      source: "config",
      is_active: true,
      is_provisioned: true,
      database_is_active: false,
    });
  });

  it("marks a static tenant without an identity row as unprovisioned", () => {
    const configSite = allSites[0]!;
    const result = buildAdminSiteRegistry([]).find((site) => site.slug === configSite.id);

    expect(result).toMatchObject({
      source: "config",
      is_active: true,
      is_provisioned: false,
    });
    expect(result?.db_id).toBeUndefined();
  });

  it("keeps DB-only tenants database-authoritative", () => {
    const row = siteRow({ is_active: false });
    const result = buildAdminSiteRegistry([row]).find((site) => site.slug === row.slug);

    expect(result).toMatchObject({
      source: "database",
      db_id: row.id,
      is_active: false,
      is_provisioned: true,
      database_is_active: false,
    });
  });

  it("identifies static tenants by slug and canonical domain", () => {
    const configSite = allSites[0]!;

    expect(isStaticConfigSiteSlug(configSite.id)).toBe(true);
    expect(isStaticConfigSite({ domain: configSite.domain })).toBe(true);
    expect(isStaticConfigSiteSlug("database-only")).toBe(false);
    expect(isStaticConfigSite({ domain: "database.example" })).toBe(false);
  });
});

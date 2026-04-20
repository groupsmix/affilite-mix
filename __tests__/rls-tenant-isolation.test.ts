/**
 * Tenant-bound RLS isolation tests (migration 00035).
 *
 * Verifies that the anon key with tenant context (x-tenant-id header)
 * cannot read cross-tenant data.  Each public table is exercised:
 *
 *   - products
 *   - content
 *   - pages
 *   - content_products
 *   - categories
 *   - sites (self-lookup)
 *
 * Test scenarios:
 *   1. Anon query WITHOUT any tenant binding returns nothing (fail-closed).
 *   2. Anon query scoped to site A cannot read site B rows.
 *   3. Anon query scoped to site A CAN read its own rows (positive check).
 *
 * These tests run against a real Supabase instance when the env vars
 * point to a non-placeholder backend (same guard as rls-isolation.test.ts).
 * They are designed for the `e2e.yml` workflow which applies all
 * migrations to a local Supabase stack.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Environment guard                                                   */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasRealDb =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON &&
  !!SUPABASE_SERVICE &&
  !SUPABASE_URL.includes("placeholder") &&
  SUPABASE_ANON !== "placeholder" &&
  SUPABASE_SERVICE !== "placeholder";

const describeIfDb = hasRealDb ? describe : describe.skip;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Create an anon client scoped to a specific tenant via x-tenant-id. */
function anonForTenant(siteId: string): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    global: { headers: { "x-tenant-id": siteId } },
    auth: { persistSession: false },
  });
}

/** Create an unscoped anon client (no tenant header). */
function anonNoTenant(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false },
  });
}

/** Deterministic fake UUID that will never match a real row. */
const FAKE_SITE_ID = "00000000-0000-0000-0000-ffffffffffff";

/* ------------------------------------------------------------------ */
/*  Core public table isolation                                         */
/* ------------------------------------------------------------------ */

const CORE_PUBLIC_TABLES = ["products", "content", "pages", "categories"] as const;

describeIfDb("Tenant-bound RLS isolation (migration 00035)", () => {
  let service: SupabaseClient;
  let siteA: string;
  let siteB: string;

  beforeAll(async () => {
    service = createClient(SUPABASE_URL!, SUPABASE_SERVICE!, {
      auth: { persistSession: false },
    });

    // Find two distinct active sites.  If fewer than two exist, seed
    // minimal rows so the test is self-contained.
    const { data: sites } = await service
      .from("sites")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(2);

    if (sites && sites.length >= 2) {
      siteA = sites[0].id;
      siteB = sites[1].id;
    } else {
      // Seed two minimal sites for testing
      const { data: seeded, error } = await service
        .from("sites")
        .insert([
          {
            slug: `rls-test-a-${Date.now()}`,
            name: "RLS Test Site A",
            domain: `rls-a-${Date.now()}.test`,
            is_active: true,
          },
          {
            slug: `rls-test-b-${Date.now()}`,
            name: "RLS Test Site B",
            domain: `rls-b-${Date.now()}.test`,
            is_active: true,
          },
        ])
        .select("id");

      if (error || !seeded || seeded.length < 2) {
        throw new Error(`Failed to seed test sites: ${JSON.stringify(error)}`);
      }
      siteA = seeded[0].id;
      siteB = seeded[1].id;
    }
  });

  /* ── 5.5  Cross-tenant leak tests ────────────────────────────────── */

  describe("anon without tenant context returns nothing (fail-closed)", () => {
    let anon: SupabaseClient;

    beforeAll(() => {
      anon = anonNoTenant();
    });

    for (const table of CORE_PUBLIC_TABLES) {
      it(`${table}: no rows without x-tenant-id`, async () => {
        const { data, error } = await anon.from(table).select("id").limit(5);

        if (error) {
          // Some implementations may return an error — that's also fine.
          return;
        }
        expect(data?.length ?? 0).toBe(0);
      });
    }

    it("sites: no rows without x-tenant-id", async () => {
      const { data, error } = await anon.from("sites").select("id").limit(5);

      if (error) return;
      expect(data?.length ?? 0).toBe(0);
    });

    it("content_products: no rows without x-tenant-id", async () => {
      const { data, error } = await anon
        .from("content_products")
        .select("content_id, product_id")
        .limit(5);

      if (error) return;
      expect(data?.length ?? 0).toBe(0);
    });
  });

  describe("anon scoped to site A cannot read site B rows", () => {
    it("products: site A client sees zero site B products", async () => {
      // Ensure site B has at least one active product (via service role).
      await service.from("products").insert({
        site_id: siteB,
        name: "Site B Product",
        slug: `site-b-product-${Date.now()}`,
        affiliate_url: "https://example.com",
        status: "active",
      });

      const anonA = anonForTenant(siteA);
      const { data } = await anonA
        .from("products")
        .select("id, site_id")
        .eq("site_id", siteB)
        .limit(10);

      expect(data?.length ?? 0).toBe(0);
    });

    it("content: site A client sees zero site B content", async () => {
      await service.from("content").insert({
        site_id: siteB,
        title: "Site B Article",
        slug: `site-b-article-${Date.now()}`,
        type: "article",
        status: "published",
        body: "test",
      });

      const anonA = anonForTenant(siteA);
      const { data } = await anonA
        .from("content")
        .select("id, site_id")
        .eq("site_id", siteB)
        .limit(10);

      expect(data?.length ?? 0).toBe(0);
    });

    it("pages: site A client sees zero site B pages", async () => {
      await service.from("pages").insert({
        site_id: siteB,
        title: "Site B Page",
        slug: `site-b-page-${Date.now()}`,
        body: "test",
        is_published: true,
      });

      const anonA = anonForTenant(siteA);
      const { data } = await anonA
        .from("pages")
        .select("id, site_id")
        .eq("site_id", siteB)
        .limit(10);

      expect(data?.length ?? 0).toBe(0);
    });

    it("categories: site A client sees zero site B categories", async () => {
      await service.from("categories").insert({
        site_id: siteB,
        name: "Site B Category",
        slug: `site-b-cat-${Date.now()}`,
      });

      const anonA = anonForTenant(siteA);
      const { data } = await anonA
        .from("categories")
        .select("id, site_id")
        .eq("site_id", siteB)
        .limit(10);

      expect(data?.length ?? 0).toBe(0);
    });

    it("sites: site A client cannot see site B", async () => {
      const anonA = anonForTenant(siteA);
      const { data } = await anonA.from("sites").select("id").eq("id", siteB).limit(1);

      expect(data?.length ?? 0).toBe(0);
    });

    it("content_products: site A client sees zero site B join rows", async () => {
      // Seed content + product + link on site B
      const ts = Date.now();
      const { data: bContent } = await service
        .from("content")
        .insert({
          site_id: siteB,
          title: `CP Test B ${ts}`,
          slug: `cp-test-b-${ts}`,
          type: "article",
          status: "published",
          body: "test",
        })
        .select("id")
        .single();

      const { data: bProduct } = await service
        .from("products")
        .insert({
          site_id: siteB,
          name: `CP Prod B ${ts}`,
          slug: `cp-prod-b-${ts}`,
          affiliate_url: "https://example.com",
          status: "active",
        })
        .select("id")
        .single();

      if (bContent && bProduct) {
        await service.from("content_products").insert({
          content_id: bContent.id,
          product_id: bProduct.id,
        });
      }

      const anonA = anonForTenant(siteA);
      const { data } = await anonA
        .from("content_products")
        .select("content_id, product_id")
        .limit(50);

      // Every returned row (if any) must belong to site A's content
      for (const row of data ?? []) {
        const { data: contentRow } = await service
          .from("content")
          .select("site_id")
          .eq("id", (row as { content_id: string }).content_id)
          .single();

        if (contentRow) {
          expect((contentRow as { site_id: string }).site_id).toBe(siteA);
        }
      }
    });
  });

  /* ── 5.6  Regression: site A CAN read its own rows ──────────────── */

  describe("site A can read its own data (positive regression)", () => {
    const ts = Date.now();

    beforeAll(async () => {
      // Seed data for site A
      await service.from("products").insert({
        site_id: siteA,
        name: `Regression Product A ${ts}`,
        slug: `reg-prod-a-${ts}`,
        affiliate_url: "https://example.com",
        status: "active",
      });

      await service.from("content").insert({
        site_id: siteA,
        title: `Regression Article A ${ts}`,
        slug: `reg-article-a-${ts}`,
        type: "article",
        status: "published",
        body: "regression test body",
      });

      await service.from("pages").insert({
        site_id: siteA,
        title: `Regression Page A ${ts}`,
        slug: `reg-page-a-${ts}`,
        body: "regression test body",
        is_published: true,
      });

      await service.from("categories").insert({
        site_id: siteA,
        name: `Regression Cat A ${ts}`,
        slug: `reg-cat-a-${ts}`,
      });
    });

    it("products: site A client reads its own active products", async () => {
      const anonA = anonForTenant(siteA);
      const { data, error } = await anonA
        .from("products")
        .select("id, site_id, slug")
        .eq("site_id", siteA)
        .eq("status", "active")
        .limit(50);

      expect(error).toBeNull();
      expect((data?.length ?? 0) > 0).toBe(true);
      for (const row of data ?? []) {
        expect((row as { site_id: string }).site_id).toBe(siteA);
      }
    });

    it("content: site A client reads its own published content", async () => {
      const anonA = anonForTenant(siteA);
      const { data, error } = await anonA
        .from("content")
        .select("id, site_id, slug")
        .eq("site_id", siteA)
        .eq("status", "published")
        .limit(50);

      expect(error).toBeNull();
      expect((data?.length ?? 0) > 0).toBe(true);
      for (const row of data ?? []) {
        expect((row as { site_id: string }).site_id).toBe(siteA);
      }
    });

    it("pages: site A client reads its own published pages", async () => {
      const anonA = anonForTenant(siteA);
      const { data, error } = await anonA
        .from("pages")
        .select("id, site_id, slug")
        .eq("site_id", siteA)
        .eq("is_published", true)
        .limit(50);

      expect(error).toBeNull();
      expect((data?.length ?? 0) > 0).toBe(true);
      for (const row of data ?? []) {
        expect((row as { site_id: string }).site_id).toBe(siteA);
      }
    });

    it("categories: site A client reads its own categories", async () => {
      const anonA = anonForTenant(siteA);
      const { data, error } = await anonA
        .from("categories")
        .select("id, site_id, slug")
        .eq("site_id", siteA)
        .limit(50);

      expect(error).toBeNull();
      expect((data?.length ?? 0) > 0).toBe(true);
      for (const row of data ?? []) {
        expect((row as { site_id: string }).site_id).toBe(siteA);
      }
    });

    it("sites: site A client can read its own site row", async () => {
      const anonA = anonForTenant(siteA);
      const { data, error } = await anonA
        .from("sites")
        .select("id, is_active")
        .eq("id", siteA)
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect((data as { id: string }).id).toBe(siteA);
    });

    it("content_products: site A client reads only its own join rows", async () => {
      // Seed a content_products link on site A
      const { data: aContent } = await service
        .from("content")
        .insert({
          site_id: siteA,
          title: `CP Reg A ${ts}`,
          slug: `cp-reg-a-${ts}`,
          type: "review",
          status: "published",
          body: "test",
        })
        .select("id")
        .single();

      const { data: aProduct } = await service
        .from("products")
        .insert({
          site_id: siteA,
          name: `CP Reg Prod A ${ts}`,
          slug: `cp-reg-prod-a-${ts}`,
          affiliate_url: "https://example.com",
          status: "active",
        })
        .select("id")
        .single();

      if (aContent && aProduct) {
        await service.from("content_products").insert({
          content_id: aContent.id,
          product_id: aProduct.id,
        });

        const anonA = anonForTenant(siteA);
        const { data, error } = await anonA
          .from("content_products")
          .select("content_id, product_id")
          .eq("content_id", aContent.id)
          .limit(5);

        expect(error).toBeNull();
        expect((data?.length ?? 0) > 0).toBe(true);
      }
    });
  });

  /* ── Missing tenant context fails safely ────────────────────────── */

  describe("missing/invalid tenant context fails safely", () => {
    it("fake site_id returns zero rows across all tables", async () => {
      const anonFake = anonForTenant(FAKE_SITE_ID);

      for (const table of CORE_PUBLIC_TABLES) {
        const { data } = await anonFake.from(table).select("id").limit(5);

        expect(data?.length ?? 0, `expected 0 rows from ${table} with fake tenant`).toBe(0);
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Skip notice                                                         */
/* ------------------------------------------------------------------ */

if (!hasRealDb) {
  describe("Tenant-bound RLS isolation", () => {
    it.skip("skipped: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY not set to real values", () => {});
  });
}

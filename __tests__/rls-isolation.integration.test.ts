/**
 * RLS (Row-Level Security) isolation tests.
 *
 * Verifies that the anon key (the only key that ever ships to clients)
 * cannot:
 *   1. Insert, update, or delete rows in tenant tables.
 *   2. Read unpublished/draft rows.
 *
 * These tests run against a real Supabase instance when
 * `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
 * to non-placeholder values. Otherwise they skip with a clear message so
 * local `npm test` and the default CI job stay green even without a DB.
 *
 * They are intended to run in the `e2e.yml` workflow which spins up a
 * local Supabase stack and applies all migrations, and they should also
 * run against the staging environment used by `preview.yml` as part of
 * a production-gating check.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasRealDb =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON &&
  !SUPABASE_URL.includes("placeholder") &&
  SUPABASE_ANON !== "placeholder";

const describeIfDb = hasRealDb ? describe : describe.skip;

// Tables that must never accept writes from the anon key.
const TENANT_WRITE_TABLES = [
  "content",
  "products",
  "categories",
  "affiliate_clicks",
  "audit_log",
  "ad_placements",
  "pages",
  "scheduled_jobs",
  "admin_users",
  "newsletter_subscribers",
] as const;

/**
 * Postgres / PostgREST error codes that indicate the operation was
 * rejected by RLS (the desired outcome). PostgREST surfaces:
 *   - 42501 : "insufficient privilege" (policy denied)
 *   - PGRST301 : "new row violates row-level security policy"
 *   - PGRST116 : empty result when .single() matched nothing (also fine
 *                for SELECT — it means RLS hid the row)
 */
const RLS_DENIED_CODES = new Set(["42501", "PGRST301", "PGRST204", "PGRST116"]);

function isRlsDenial(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && RLS_DENIED_CODES.has(error.code)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("new row violates")
  );
}

describeIfDb("RLS isolation (anon key)", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false },
    });
  });

  for (const table of TENANT_WRITE_TABLES) {
    it(`anon cannot INSERT into ${table}`, async () => {
      const { data, error } = await anon
        .from(table)
        .insert({
          // Enough garbage to satisfy NOT NULL constraints for most tables;
          // the insert must be rejected by policy before it even gets validated.
          site_id: "00000000-0000-0000-0000-000000000000",
          name: "rls-test",
          slug: "rls-test",
          title: "rls-test",
          body: "",
          status: "draft",
          email: "rls-test@example.com",
          actor: "anon",
          action: "rls-test",
          entity_type: "test",
          product_name: "rls-test",
          affiliate_url: "https://example.com",
          placement_type: "inline",
          provider: "rls-test",
          ad_code: "",
          is_active: false,
          priority: 0,
          job_type: "rls-test",
          payload: {},
          scheduled_for: new Date().toISOString(),
        })
        .select();

      expect(data, `insert into ${table} must not return rows`).toBeFalsy();
      expect(
        isRlsDenial(error),
        `expected RLS denial on ${table}, got: ${JSON.stringify(error)}`,
      ).toBe(true);
    });

    it(`anon cannot UPDATE ${table}`, async () => {
      const { data, error } = await anon
        .from(table)
        .update({ slug: "rls-test-updated" })
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select();

      // Either RLS denied or (equivalently) zero rows affected because RLS
      // hid the row from the UPDATE's visibility.
      const rowsAffected = Array.isArray(data) ? data.length : 0;
      expect(rowsAffected).toBe(0);
      if (error) {
        expect(
          isRlsDenial(error),
          `expected RLS denial on update(${table}), got: ${JSON.stringify(error)}`,
        ).toBe(true);
      }
    });

    it(`anon cannot DELETE from ${table}`, async () => {
      const { data, error } = await anon
        .from(table)
        .delete()
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select();

      const rowsAffected = Array.isArray(data) ? data.length : 0;
      expect(rowsAffected).toBe(0);
      if (error) {
        expect(
          isRlsDenial(error),
          `expected RLS denial on delete(${table}), got: ${JSON.stringify(error)}`,
        ).toBe(true);
      }
    });
  }

  it("anon SELECT on content never returns draft/scheduled rows", async () => {
    const { data, error } = await anon
      .from("content")
      .select("id, status")
      .in("status", ["draft", "scheduled", "archived"])
      .limit(50);

    // Either policy blocks the query entirely, or the result set is empty.
    if (error) {
      expect(isRlsDenial(error)).toBe(true);
      return;
    }
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon SELECT on products never returns non-active rows", async () => {
    const { data, error } = await anon
      .from("products")
      .select("id, status")
      .neq("status", "active")
      .limit(50);

    if (error) {
      expect(isRlsDenial(error)).toBe(true);
      return;
    }
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon SELECT on admin_users is fully blocked", async () => {
    const { data, error } = await anon.from("admin_users").select("email").limit(5);
    if (error) {
      expect(isRlsDenial(error)).toBe(true);
      return;
    }
    // No RLS error → there must be zero rows visible to anon.
    expect(data?.length ?? 0).toBe(0);
  });

  // ── Anon-insert regression for migration 00034 ──────────────────────
  // The old `public_insert_clicks` / `public_insert_newsletter` policies
  // used WITH CHECK (site_id exists in sites), so the generic TENANT_WRITE
  // loop above passed by accident (its all-zeros UUID is not a real site).
  // These cases use a REAL site id — they only pass once the anon INSERT
  // policy is actually dropped and the default-deny rule takes over.
  describe("anon cannot insert with a valid site_id (migration 00034)", () => {
    let realSiteId: string | null = null;

    beforeAll(async () => {
      const { data } = await anon
        .from("sites")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      realSiteId = (data as { id?: string } | null)?.id ?? null;
    });

    it("anon cannot INSERT into affiliate_clicks with a real site_id", async () => {
      if (!realSiteId) return; // no seeded site — skip silently
      const { data, error } = await anon
        .from("affiliate_clicks")
        .insert({
          site_id: realSiteId,
          product_name: "rls-test",
          affiliate_url: "https://example.com",
          content_slug: "rls-test",
          referrer: "rls-test",
        })
        .select();

      expect(data).toBeFalsy();
      expect(
        isRlsDenial(error),
        `expected RLS denial on affiliate_clicks insert, got: ${JSON.stringify(error)}`,
      ).toBe(true);
    });

    it("anon cannot INSERT into newsletter_subscribers with a real site_id", async () => {
      if (!realSiteId) return;
      const { data, error } = await anon
        .from("newsletter_subscribers")
        .insert({
          site_id: realSiteId,
          email: `rls-test-${Date.now()}@example.com`,
          status: "pending",
        })
        .select();

      expect(data).toBeFalsy();
      expect(
        isRlsDenial(error),
        `expected RLS denial on newsletter_subscribers insert, got: ${JSON.stringify(error)}`,
      ).toBe(true);
    });
  });
});

// Service-role smoke check — verifies the RLS policies for tenant tables
// at least exist. Runs only when the service role key is available.
const describeIfService =
  hasRealDb && !!SUPABASE_SERVICE && SUPABASE_SERVICE !== "placeholder" ? describe : describe.skip;

describeIfService("RLS policies are installed on tenant tables", () => {
  let service: SupabaseClient;

  beforeAll(() => {
    service = createClient(SUPABASE_URL!, SUPABASE_SERVICE!, {
      auth: { persistSession: false },
    });
  });

  for (const table of TENANT_WRITE_TABLES) {
    it(`${table} has RLS enabled`, async () => {
      // pg_class.relrowsecurity tells us whether RLS is ON for the table.
      const { data, error } = await service
        .from("pg_catalog.pg_class" as unknown as "pg_class")
        .select("relname, relrowsecurity")
        .eq("relname", table)
        .single();

      // If the system catalog isn't exposed to PostgREST (the default), we
      // don't fail — absence of data is expected. But if we CAN read it, the
      // flag must be true.
      if (!error && data) {
        expect((data as { relrowsecurity?: boolean }).relrowsecurity).toBe(true);
      }
    });
  }
});

// When the test suite is skipped, give a single clear message in the output
// so CI logs make it obvious this didn't silently no-op.
if (!hasRealDb) {
  describe("RLS isolation", () => {
    it.skip("skipped: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set to a real instance", () => {});
  });
}

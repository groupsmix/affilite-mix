import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ══════════════════════════════════════════════════════════════════
// Part 1: Unit / integration tests (mocked Supabase)
// ══════════════════════════════════════════════════════════════════

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("site-uuid-123"),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeUnsubscribePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/newsletter/unsubscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      "x-site-id": "test-site",
    },
    body: JSON.stringify(body),
  });
}

function makeUnsubscribeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/newsletter/unsubscribe");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { "x-forwarded-for": "127.0.0.1", "x-site-id": "test-site" },
  });
}

// ── POST /api/newsletter/unsubscribe abuse paths ────────────────

describe("POST /api/newsletter/unsubscribe – abuse paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when unsubscribe_token is missing", async () => {
    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = makeUnsubscribePostRequest({ email: "victim@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsubscribe_token/i);
  });

  it("rejects when unsubscribe_token is empty string", async () => {
    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = makeUnsubscribePostRequest({
      email: "victim@example.com",
      unsubscribe_token: "  ",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsubscribe_token/i);
  });

  it("returns 403 when unsubscribe_token does not match", async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = makeUnsubscribePostRequest({
      email: "victim@example.com",
      unsubscribe_token: "00000000-0000-0000-0000-000000000000",
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it("email + site_id alone cannot unsubscribe (token required)", async () => {
    const updateSpy = vi.fn();
    mockFrom.mockReturnValue({
      update: (...args: unknown[]) => {
        updateSpy(...args);
        return {
          eq: () => ({
            eq: () => ({
              eq: () => ({
                select: () => Promise.resolve({ data: [{ id: "sub-1" }], error: null }),
              }),
            }),
          }),
        };
      },
    });

    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");

    // Without token → 400
    const reqNoToken = makeUnsubscribePostRequest({ email: "victim@example.com" });
    const resNoToken = await POST(reqNoToken);
    expect(resNoToken.status).toBe(400);

    // With valid token → 200
    const reqWithToken = makeUnsubscribePostRequest({
      email: "victim@example.com",
      unsubscribe_token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    const resWithToken = await POST(reqWithToken);
    expect(resWithToken.status).toBe(200);
  });
});

// ── GET /api/newsletter/unsubscribe abuse paths ─────────────────

describe("GET /api/newsletter/unsubscribe – abuse paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects with error when token is missing", async () => {
    const { GET } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = makeUnsubscribeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=missing_token");
  });

  it("redirects with error when token is invalid (no matching row)", async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = makeUnsubscribeGetRequest({ token: "00000000-0000-0000-0000-000000000000" });
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_token");
  });
});

// ══════════════════════════════════════════════════════════════════
// Part 2: RLS abuse tests (real Supabase — skipped without creds)
// ══════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const hasRealDb =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON &&
  !SUPABASE_URL.includes("placeholder") &&
  SUPABASE_ANON !== "placeholder";

const describeIfDb = hasRealDb ? describe : describe.skip;

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

describeIfDb("Direct anon insert blocked (abuse regression)", () => {
  let anon: SupabaseClient;
  let realSiteId: string | null = null;

  beforeEach(() => {
    // Create a fresh client so mocks from Part 1 don't interfere
    anon = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false },
    });
  });

  it("resolves a real site_id for subsequent tests", async () => {
    const { data } = await anon
      .from("sites")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    realSiteId = (data as { id?: string } | null)?.id ?? null;
    // If no site is seeded the remaining tests in this block will skip.
  });

  it("anon cannot INSERT into newsletter_subscribers", async () => {
    if (!realSiteId) return;
    const { data, error } = await anon
      .from("newsletter_subscribers")
      .insert({
        site_id: realSiteId,
        email: `abuse-test-${Date.now()}@example.com`,
        status: "pending",
      })
      .select();

    expect(data).toBeFalsy();
    expect(
      isRlsDenial(error),
      `expected RLS denial on newsletter_subscribers, got: ${JSON.stringify(error)}`,
    ).toBe(true);
  });

  it("anon cannot INSERT into affiliate_clicks", async () => {
    if (!realSiteId) return;
    const { data, error } = await anon
      .from("affiliate_clicks")
      .insert({
        site_id: realSiteId,
        product_name: "abuse-test",
        affiliate_url: "https://example.com",
        content_slug: "abuse-test",
      })
      .select();

    expect(data).toBeFalsy();
    expect(
      isRlsDenial(error),
      `expected RLS denial on affiliate_clicks, got: ${JSON.stringify(error)}`,
    ).toBe(true);
  });
});

if (!hasRealDb) {
  describe("Direct anon insert blocked (abuse regression)", () => {
    it.skip("skipped: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set", () => {});
  });
}

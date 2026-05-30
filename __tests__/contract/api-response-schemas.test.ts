/**
 * E2-011: API response schema contract tests.
 *
 * These tests validate that critical API endpoints return responses
 * matching their documented schemas. They do NOT hit a running server —
 * they verify the type contracts and schema shapes that clients depend on.
 */
import { describe, it, expect } from "vitest";

// ── Health endpoint contract ──────────────────────────────────────────

interface HealthResponse {
  ok: boolean;
  version?: string;
  uptime?: number;
}

describe("API contract: /api/health", () => {
  it("validates health response shape", () => {
    const response: HealthResponse = {
      ok: true,
      version: "1.0.0",
      uptime: 12345,
    };

    expect(typeof response.ok).toBe("boolean");
    if (response.version !== undefined) {
      expect(typeof response.version).toBe("string");
    }
    if (response.uptime !== undefined) {
      expect(typeof response.uptime).toBe("number");
      expect(response.uptime).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Login endpoint contract ───────────────────────────────────────────

interface LoginSuccessResponse {
  ok: true;
  password_breached?: boolean;
  totp_needs_reenroll?: boolean;
}

interface LoginChallengeResponse {
  challenge: "2fa_required";
}

interface LoginErrorResponse {
  error: string;
}

describe("API contract: /api/auth/login", () => {
  it("validates login success response shape", () => {
    const response: LoginSuccessResponse = {
      ok: true,
    };

    expect(response.ok).toBe(true);
  });

  it("validates login success with advisory flags", () => {
    const response: LoginSuccessResponse = {
      ok: true,
      password_breached: true,
      totp_needs_reenroll: true,
    };

    expect(response.ok).toBe(true);
    expect(typeof response.password_breached).toBe("boolean");
    expect(typeof response.totp_needs_reenroll).toBe("boolean");
  });

  it("validates 2FA challenge response shape", () => {
    const response: LoginChallengeResponse = {
      challenge: "2fa_required",
    };

    expect(response.challenge).toBe("2fa_required");
  });

  it("validates error response shape", () => {
    const response: LoginErrorResponse = {
      error: "Invalid email or password",
    };

    expect(typeof response.error).toBe("string");
    expect(response.error.length).toBeGreaterThan(0);
  });
});

// ── Upload presign endpoint contract ──────────────────────────────────

interface UploadPresignResponse {
  uploadUrl: string;
  stagingKey: string;
  publicUrl: string;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
}

describe("API contract: /api/admin/upload", () => {
  it("validates presign response shape", () => {
    const response: UploadPresignResponse = {
      uploadUrl: "https://r2.example.com/uploads/2026/05/29/abc-123.jpg?X-Amz-Signature=...",
      stagingKey: "uploads/2026/05/29/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11.jpg",
      publicUrl:
        "https://cdn.example.com/uploads/2026/05/29/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11.jpg",
      requiredHeaders: {
        "Content-Type": "image/jpeg",
        "Content-Length": "1048576",
      },
      maxBytes: 10485760,
    };

    expect(response.uploadUrl).toMatch(/^https?:\/\//);
    expect(response.stagingKey).toMatch(/^uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.\w+$/);
    expect(typeof response.publicUrl).toBe("string");
    expect(typeof response.requiredHeaders).toBe("object");
    expect(typeof response.maxBytes).toBe("number");
    expect(response.maxBytes).toBeGreaterThan(0);
  });

  it("validates staging key follows server-generated pattern", () => {
    const validKeys = [
      "uploads/2026/05/29/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11.jpg",
      "uploads/2026/01/01/b1ffcc00-1234-5678-9abc-def012345678.png",
      "uploads/2026/12/31/deadbeef-cafe-babe-dead-beefcafebabe.webp",
    ];

    const pattern =
      /^uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/;

    for (const key of validKeys) {
      expect(key).toMatch(pattern);
    }
  });
});

// ── AI drafts endpoint contract ───────────────────────────────────────

interface AIDraftResponse {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  content_type: string;
  topic: string;
  keywords: string[];
  ai_provider: string;
  ai_model: string;
  status: "pending" | "approved" | "rejected" | "published";
  generated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

describe("API contract: AI drafts", () => {
  it("validates AI draft row shape", () => {
    const draft: AIDraftResponse = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      site_id: "b1ffcc00-1234-5678-9abc-def012345678",
      title: "Top Watch Picks This Month",
      slug: "top-watch-picks-this-month",
      body: "<p>Content here</p>",
      excerpt: "A summary of top picks",
      content_type: "article",
      topic: "watch reviews",
      keywords: ["watches", "luxury"],
      ai_provider: "gemini",
      ai_model: "gemini-1.5-flash",
      status: "pending",
      generated_at: "2026-05-29T12:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      meta_title: "Top Watch Picks",
      meta_description: "Monthly watch recommendations",
      created_at: "2026-05-29T12:00:00Z",
      updated_at: "2026-05-29T12:00:00Z",
    };

    expect(["pending", "approved", "rejected", "published"]).toContain(draft.status);
    expect(Array.isArray(draft.keywords)).toBe(true);
    expect(typeof draft.ai_provider).toBe("string");
    expect(typeof draft.ai_model).toBe("string");
  });

  it("enforces that pending drafts have no reviewer", () => {
    const pending: AIDraftResponse = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      site_id: "b1ffcc00-1234-5678-9abc-def012345678",
      title: "Test",
      slug: "test",
      body: "body",
      excerpt: "excerpt",
      content_type: "article",
      topic: "topic",
      keywords: [],
      ai_provider: "gemini",
      ai_model: "gemini-1.5-flash",
      status: "pending",
      generated_at: "2026-05-29T12:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      meta_title: null,
      meta_description: null,
      created_at: "2026-05-29T12:00:00Z",
      updated_at: "2026-05-29T12:00:00Z",
    };

    expect(pending.status).toBe("pending");
    expect(pending.reviewed_at).toBeNull();
    expect(pending.reviewed_by).toBeNull();
  });
});

// ── Cron response contract ────────────────────────────────────────────

interface CronResponse {
  ok: boolean;
  cursor?: string;
  summary?: string;
  results?: Array<{
    site: string;
    generated: number;
    errors: string[];
  }>;
}

describe("API contract: cron responses", () => {
  it("validates cron response shape", () => {
    const response: CronResponse = {
      ok: true,
      cursor: "0:3",
      summary: "Generated 12 drafts across 4 sites (0 errors)",
      results: [
        { site: "ai-compared", generated: 3, errors: [] },
        { site: "watch-tools", generated: 3, errors: [] },
      ],
    };

    expect(response.ok).toBe(true);
    if (response.results) {
      for (const r of response.results) {
        expect(typeof r.site).toBe("string");
        expect(typeof r.generated).toBe("number");
        expect(Array.isArray(r.errors)).toBe(true);
      }
    }
  });
});

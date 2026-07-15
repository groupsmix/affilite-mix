import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/automation/auth", () => ({
  authenticateAutomationRequest: vi.fn(),
}));
vi.mock("@/lib/dal/automation-actions", () => ({
  getActionByIdempotencyKey: vi.fn(),
  createAutomationAction: vi.fn(),
  updateAutomationAction: vi.fn(),
}));
vi.mock("@/lib/dal/automation-runs", () => ({
  getAutomationRunById: vi.fn(),
  countActionsSince: vi.fn(),
}));
vi.mock("@/lib/dal/automation-policies", () => ({
  getPolicyForAction: vi.fn(),
}));
vi.mock("@/lib/dal/ai-drafts", () => ({
  createAIDraft: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/automation/v1/content/drafts/route";
import { authenticateAutomationRequest } from "@/lib/automation/auth";
import {
  getActionByIdempotencyKey,
  createAutomationAction,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import { countActionsSince } from "@/lib/dal/automation-runs";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { payloadHash } from "@/lib/automation/idempotency";

const authed = authenticateAutomationRequest as unknown as ReturnType<typeof vi.fn>;
const getAction = getActionByIdempotencyKey as unknown as ReturnType<typeof vi.fn>;
const createAction = createAutomationAction as unknown as ReturnType<typeof vi.fn>;
const updateAction = updateAutomationAction as unknown as ReturnType<typeof vi.fn>;
const getPolicy = getPolicyForAction as unknown as ReturnType<typeof vi.fn>;
const countActions = countActionsSince as unknown as ReturnType<typeof vi.fn>;
const createDraft = createAIDraft as unknown as ReturnType<typeof vi.fn>;

const VALID_BODY = {
  title: "Best Widgets 2026",
  slug: "best-widgets-2026",
  body: "<p>Long form content about widgets.</p>",
  excerpt: "A roundup.",
  content_type: "article",
  topic: "widgets",
  keywords: ["widgets", "gear"],
};

function draftRequest(headers: Record<string, string>, body: unknown): NextRequest {
  return new NextRequest("https://x.dev/api/automation/v1/content/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const IDEM = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  authed.mockResolvedValue({
    ok: true,
    context: {
      token: { id: "tok-1" },
      account: {
        id: "sa-1",
        scopes: ["content:draft"],
        max_actions_per_day: 200,
        max_actions_per_run: 25,
      },
      siteId: "site-1",
      scopes: ["content:draft"],
    },
  });
  getPolicy.mockResolvedValue(null);
  countActions.mockResolvedValue(0);
  getAction.mockResolvedValue(null);
  createAction.mockImplementation((v: Record<string, unknown>) => ({ id: "act-1", ...v }));
  updateAction.mockResolvedValue({ id: "act-1" });
  createDraft.mockResolvedValue({
    id: "draft-1",
    status: "pending",
    title: VALID_BODY.title,
    slug: VALID_BODY.slug,
  });
});

describe("POST /api/automation/v1/content/drafts", () => {
  it("rejects a missing scope with 403", async () => {
    authed.mockResolvedValueOnce({
      ok: true,
      context: {
        token: { id: "t" },
        account: { id: "sa-1", scopes: [], max_actions_per_day: 200, max_actions_per_run: 25 },
        siteId: "site-1",
        scopes: [],
      },
    });
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(403);
  });

  it("requires an Idempotency-Key header", async () => {
    const res = await POST(draftRequest({ authorization: "Bearer x" }, VALID_BODY));
    expect(res.status).toBe(400);
    expect(createAction).not.toHaveBeenCalled();
  });

  it("creates a pending draft on the happy path (201)", async () => {
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.draft_id).toBe("draft-1");
    expect(body.data.status).toBe("pending");
    expect(createDraft).toHaveBeenCalledOnce();
    // Draft is created with pending status — publishing stays approval-gated.
    expect(createDraft.mock.calls[0]![0].status).toBe("pending");
  });

  it("replays the original result for the same key + same payload", async () => {
    const hash = await payloadHash({
      title: VALID_BODY.title,
      slug: VALID_BODY.slug,
      body: VALID_BODY.body,
      excerpt: VALID_BODY.excerpt,
      content_type: VALID_BODY.content_type,
      topic: VALID_BODY.topic,
      keywords: VALID_BODY.keywords,
      meta_title: null,
      meta_description: null,
      ai_provider: "external",
      ai_model: "unknown",
      run_id: null,
    });
    getAction.mockResolvedValueOnce({
      id: "act-prior",
      payload_hash: hash,
      status: "succeeded",
      after_snapshot: { draft_id: "draft-prior" },
    });
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.replayed).toBe(true);
    expect(body.data.draft_id).toBe("draft-prior");
    // A replay must NOT create a new draft or action.
    expect(createDraft).not.toHaveBeenCalled();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("returns 409 for the same key + different payload", async () => {
    getAction.mockResolvedValueOnce({
      id: "act-prior",
      payload_hash: "totally-different-hash",
      status: "succeeded",
    });
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(409);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("rejects invalid input with 422 before touching any DAL", async () => {
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, { title: "" }),
    );
    expect(res.status).toBe(422);
    expect(createAction).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("denies when the daily limit is exhausted and does not create a draft", async () => {
    countActions.mockResolvedValueOnce(200);
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("AUTOMATION_POLICY_DENIED");
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("returns 202 approval-required when a site override gates drafts", async () => {
    getPolicy.mockResolvedValueOnce({
      mode: "approval_required",
      constraints: {},
      is_active: true,
    });
    const res = await POST(
      draftRequest({ authorization: "Bearer x", "idempotency-key": IDEM }, VALID_BODY),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.error.code).toBe("AUTOMATION_POLICY_APPROVAL_REQUIRED");
    // Draft is not created; a manual_attention action is recorded instead.
    expect(createDraft).not.toHaveBeenCalled();
    expect(createAction).toHaveBeenCalledOnce();
    expect(createAction.mock.calls[0]![0].status).toBe("manual_attention");
  });
});

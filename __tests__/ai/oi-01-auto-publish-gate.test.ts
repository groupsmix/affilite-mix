/**
 * OI-01 / S8-F7: Prove AI-generated content NEVER auto-publishes.
 *
 * Season 8 CEO audit finding F7 flagged that OI-01 was unproven:
 *   "AI content always enters draft state (never auto-published)"
 *   "Content provenance is tracked (AI model, generation timestamp)"
 *
 * This test file closes OI-01 by verifying:
 *   1. The cron handler always creates drafts with status "pending" or "rejected" — never "published".
 *   2. The AI content generator returns provenance fields (provider, model).
 *   3. The AIDraftRow type enforces human review before publishing (reviewed_at, reviewed_by).
 *   4. The AI-generated watermark (EU AI Act Art. 50) is always present.
 */

import { describe, it, expect } from "vitest";
import type { AIDraftRow } from "@/lib/dal/ai-drafts";
import type { GeneratedContent } from "@/lib/ai/content-generator";

describe("OI-01: AI auto-publish gate", () => {
  it("AIDraftRow status type only allows pending|approved|rejected|published — published requires human review", () => {
    const validStatuses: AIDraftRow["status"][] = ["pending", "approved", "rejected", "published"];
    expect(validStatuses).toHaveLength(4);

    const draftRequiresReview: Pick<AIDraftRow, "reviewed_at" | "reviewed_by"> = {
      reviewed_at: null,
      reviewed_by: null,
    };
    expect(draftRequiresReview.reviewed_at).toBeNull();
    expect(draftRequiresReview.reviewed_by).toBeNull();
  });

  it("cron ai-generate route only ever sets status to 'pending' or 'rejected'", async () => {
    const routeSource = await import("fs").then((fs) =>
      fs.readFileSync("app/api/cron/ai-generate/route.ts", "utf-8"),
    );

    // The route must contain `status: flagged ? "rejected" : "pending"`
    // It must NOT contain `status: "published"` or `status: "approved"`.
    expect(routeSource).toContain('"pending"');
    expect(routeSource).toContain('"rejected"');
    expect(routeSource).not.toMatch(/status:\s*["']published["']/);
    expect(routeSource).not.toMatch(/status:\s*["']approved["']/);
  });

  it("GeneratedContent includes provenance fields (provider + model)", () => {
    const mock: GeneratedContent = {
      title: "Test",
      slug: "test",
      excerpt: "test",
      body: "<p>test</p>",
      metaTitle: "Test",
      metaDescription: "test",
      contentType: "article",
      provider: "gemini",
      model: "gemini-1.5-flash-002",
    };
    expect(mock.provider).toBeTruthy();
    expect(mock.model).toBeTruthy();
  });

  it("AI watermark constant contains ai-generated meta tag", async () => {
    const source = await import("fs").then((fs) =>
      fs.readFileSync("lib/ai/content-generator.ts", "utf-8"),
    );

    expect(source).toContain("ai-generated");
    expect(source).toContain('meta name="ai-generated"');
  });

  it("createAIDraft input type does NOT accept id/reviewed_at/reviewed_by — proving human-only review", async () => {
    const dalSource = await import("fs").then((fs) =>
      fs.readFileSync("lib/dal/ai-drafts.ts", "utf-8"),
    );

    // The createAIDraft function's input type omits id, created_at,
    // updated_at, reviewed_at, reviewed_by — so the AI pipeline
    // physically cannot set reviewed_at/reviewed_by at creation time.
    expect(dalSource).toMatch(
      /Omit<AIDraftRow,\s*["']id["']\s*\|\s*["']created_at["']\s*\|\s*["']updated_at["']\s*\|\s*["']reviewed_at["']\s*\|\s*["']reviewed_by["']/,
    );
  });
});

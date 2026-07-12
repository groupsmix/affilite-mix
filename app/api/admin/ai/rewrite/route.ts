import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { rewriteText, type RewriteAction } from "@/lib/ai/rewrite";
import { parseJsonBody } from "@/lib/api-error";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";

const VALID_ACTIONS = new Set<RewriteAction>(["expand", "rewrite", "rephrase", "summarize"]);

/**
 * POST /api/admin/ai/rewrite
 *
 * Rewrite or expand selected text in the content editor. Uses the same AI
 * provider fallback chain and rate limits as the AI content engine.
 */
export const POST = withAuthz("content", "edit", async (request, { session }) => {
  const rlResponse = await enforceAdminRateLimit("ai-content", session);
  if (rlResponse) return rlResponse;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const body = rawOrError as { text?: string; action?: string };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const action = body.action ?? "rewrite";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (!VALID_ACTIONS.has(action as RewriteAction)) {
    return NextResponse.json(
      { error: "action must be one of: expand, rewrite, rephrase, summarize" },
      { status: 400 },
    );
  }

  try {
    const result = await rewriteText(text, action as RewriteAction);
    return NextResponse.json(result);
  } catch (err) {
    captureException(err, { context: "[api/admin/ai/rewrite] failed" });
    return NextResponse.json({ error: "Failed to rewrite text" }, { status: 502 });
  }
});

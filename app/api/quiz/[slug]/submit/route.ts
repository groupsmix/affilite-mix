import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import {
  getQuizBySlug,
  createQuizSubmission,
  updateQuizSubmission,
  deriveResultTags,
} from "@/lib/dal/quizzes";
import { getTenantClient } from "@/lib/supabase-server";
import { getClientIp } from "@/lib/get-client-ip";
import { isValidEmail, normalizeEmail } from "@/lib/validate-email";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { isUsableUuid } from "@/lib/security/uuid";

/**
 * POST /api/quiz/:slug/submit
 * Submit quiz answers (partial or complete).
 * Body: { submission_id?: string, answers: Record<string, any>, email?: string }
 *
 * If submission_id is provided, updates existing submission.
 * If email is provided and quiz gates results, marks as completed.
 * Returns matched products based on result tags.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Rate limit: 30 submissions/hour per IP
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`quiz-submit:${ip}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: {
    submission_id?: string;
    answers?: Record<string, string | string[] | number>;
    email?: string;
    session_id?: string;
  };
  const parsed = await parseJsonBody(request);
  if (parsed instanceof NextResponse) return parsed;
  body = parsed as typeof body;

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const quiz = await getQuizBySlug(siteId, slug);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    // S9-NEW-05: Validate and normalize email before storage.
    if (body.email) {
      if (!isValidEmail(body.email)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
      body.email = normalizeEmail(body.email);
    }

    const answers = body.answers || {};
    const resultTags = deriveResultTags(quiz.steps, answers);

    // SEC-UUID-01 (#631): Validate submission_id is a UUID before DB query.
    if (body.submission_id && !isUsableUuid(body.submission_id)) {
      return NextResponse.json({ error: "Invalid submission_id" }, { status: 400 });
    }

    let submission;
    if (body.submission_id) {
      // Update existing submission
      const isComplete = body.email || !quiz.result_config.gate_email;
      submission = await updateQuizSubmission(body.submission_id, siteId, {
        answers,
        result_tags: resultTags,
        ...(body.email ? { email: body.email } : {}),
        ...(isComplete
          ? { status: "completed" as const, completed_at: new Date().toISOString() }
          : {}),
      });
    } else {
      // Create new submission
      submission = await createQuizSubmission({
        quiz_id: quiz.id,
        site_id: siteId,
        session_id: body.session_id,
      });
      const isComplete = body.email || !quiz.result_config.gate_email;
      submission = await updateQuizSubmission(submission.id, siteId, {
        answers,
        result_tags: resultTags,
        ...(body.email ? { email: body.email } : {}),
        ...(isComplete
          ? { status: "completed" as const, completed_at: new Date().toISOString() }
          : {}),
      });
    }

    // If gated and no email yet, return submission ID but no results
    if (quiz.result_config.gate_email && !submission.email) {
      return NextResponse.json({
        submission_id: submission.id,
        status: "awaiting_email",
        tags: resultTags,
      });
    }

    // Fetch matching products by tags
    const sb = await getTenantClient();
    const { data: products } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: uses site-scoped getTenantClient() (RLS-enforced)
      .from("products")
      .select(
        "id, name, slug, image_url, price, price_amount, price_currency, score, affiliate_url, merchant, cta_text",
      )
      .eq("site_id", siteId)
      .eq("status", "active")
      .containedBy("tags", resultTags)
      .order("score", { ascending: false })
      .limit(quiz.result_config.max_results || 5);

    return NextResponse.json({
      submission_id: submission.id,
      status: "completed",
      tags: resultTags,
      products: products || [],
    });
  } catch (err) {
    // SEC-ERR-01 (#630): Log internally but never leak error details to client.
    logger.error("quiz.submit_failed", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "api/quiz/submit.POST" });
    return NextResponse.json({ error: "Failed to submit quiz" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import {
  getQuizBySlug,
  createQuizSubmission,
  updateQuizSubmission,
  deriveResultTags,
} from "@/lib/dal/quizzes";
import { getServiceClient } from "@/lib/supabase-server";

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
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`quiz-submit:${ip}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
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
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const quiz = await getQuizBySlug(siteId, slug);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const answers = body.answers || {};
    const resultTags = deriveResultTags(quiz.steps, answers);

    let submission;
    if (body.submission_id) {
      // Update existing submission
      const isComplete = body.email || !quiz.result_config.gate_email;
      submission = await updateQuizSubmission(body.submission_id, {
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
      submission = await updateQuizSubmission(submission.id, {
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
    const sb = getServiceClient();
    const { data: products } = await sb
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
    return NextResponse.json(
      { error: "Failed to submit quiz", detail: err instanceof Error ? err.message : undefined },
      { status: 500 },
    );
  }
}

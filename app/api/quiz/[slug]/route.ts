import { NextRequest, NextResponse } from "next/server";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getQuizBySlug } from "@/lib/dal/quizzes";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * GET /api/quiz/:slug
 * Returns quiz definition (steps, config) for rendering the quiz UI.
 *
 * audit5-#4: the submit endpoint already rate-limits at 30/hr per IP;
 * GET had none, so unauthenticated DB reads on the quiz table were
 * unbounded. Mirroring the submit shape with a higher ceiling (60/min,
 * `failPolicy: "open"` because the quiz UI fetches the definition on
 * every page load and a KV outage shouldn't blank the quiz for everyone).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`quiz-get:${ip}`, {
    maxRequests: 60,
    windowMs: 60_000,
    failPolicy: "open" as const,
  });
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const { slug } = await params;

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const quiz = await getQuizBySlug(siteId, slug);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: quiz.id,
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      steps: quiz.steps,
      gate_email: quiz.result_config.gate_email,
      max_results: quiz.result_config.max_results,
    });
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "Failed to load quiz" }, { status: 500 });
  }
}

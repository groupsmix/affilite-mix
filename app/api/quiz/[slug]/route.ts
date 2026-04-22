import { NextRequest, NextResponse } from "next/server";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getQuizBySlug } from "@/lib/dal/quizzes";

/**
 * GET /api/quiz/:slug
 * Returns quiz definition (steps, config) for rendering the quiz UI.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
    return NextResponse.json({ error: "Failed to load quiz" }, { status: 500 });
  }
}

import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

/** A single quiz step definition */
export interface QuizStep {
  id: string;
  question: string;
  type: "single" | "multiple" | "range" | "text";
  options?: { value: string; label: string; icon?: string }[];
  range?: { min: number; max: number; step: number; unit?: string };
  tags?: Record<string, string[]>; // answer value → tags to apply
  required?: boolean;
}

/** Result configuration */
export interface QuizResultConfig {
  gate_email: boolean; // require email to see results
  max_results: number;
  match_mode: "tags" | "score"; // how to match products
  drip_campaign_id?: string;
}

export interface QuizRow {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  description: string | null;
  steps: QuizStep[];
  result_config: QuizResultConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuizSubmissionRow {
  id: string;
  quiz_id: string;
  site_id: string;
  session_id: string | null;
  email: string | null;
  answers: Record<string, string | string[] | number>;
  result_tags: string[];
  status: "in_progress" | "completed" | "abandoned";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const QUIZ_TABLE = "quizzes";
const SUBMISSION_TABLE = "quiz_submissions";

/** Get active quiz by slug */
export async function getQuizBySlug(siteId: string, slug: string): Promise<QuizRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(QUIZ_TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<QuizRow>(data);
}

/** List active quizzes for a site */
export async function listQuizzes(siteId: string): Promise<QuizRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(QUIZ_TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return assertRows<QuizRow>(data);
}

/** Create a quiz */
export async function createQuiz(input: {
  site_id: string;
  slug: string;
  title: string;
  description?: string;
  steps: QuizStep[];
  result_config: QuizResultConfig;
}): Promise<QuizRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(QUIZ_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<QuizRow>(data, "Quiz");
}

/** Start a quiz submission */
export async function createQuizSubmission(input: {
  quiz_id: string;
  site_id: string;
  session_id?: string;
}): Promise<QuizSubmissionRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(SUBMISSION_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<QuizSubmissionRow>(data, "QuizSubmission");
}

/** Update a submission with answers and optionally complete it */
export async function updateQuizSubmission(
  id: string,
  input: {
    answers?: Record<string, string | string[] | number>;
    email?: string;
    result_tags?: string[];
    status?: "in_progress" | "completed" | "abandoned";
    completed_at?: string;
  },
): Promise<QuizSubmissionRow> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(SUBMISSION_TABLE)
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return assertRow<QuizSubmissionRow>(data, "QuizSubmission");
}

/** Get a submission by ID */
export async function getQuizSubmission(id: string): Promise<QuizSubmissionRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(SUBMISSION_TABLE).select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return rowOrNull<QuizSubmissionRow>(data);
}

/**
 * Derive result tags from quiz answers based on step tag mappings.
 */
export function deriveResultTags(
  steps: QuizStep[],
  answers: Record<string, string | string[] | number>,
): string[] {
  const tags = new Set<string>();

  for (const step of steps) {
    if (!step.tags) continue;
    const answer = answers[step.id];
    if (answer === undefined) continue;

    // Handle both single and multiple choice
    const values = Array.isArray(answer) ? answer : [String(answer)];
    for (const val of values) {
      const stepTags = step.tags[val];
      if (stepTags) {
        for (const tag of stepTags) {
          tags.add(tag);
        }
      }
    }
  }

  return Array.from(tags);
}

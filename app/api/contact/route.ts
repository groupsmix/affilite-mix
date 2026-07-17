import { NextRequest, NextResponse } from "next/server";
import { getCurrentSite } from "@/lib/site-context";
import { getTenantClient } from "@/lib/supabase-server";
import { parseJsonBody, apiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";

const MAX_NAME_LEN = 128;
const MAX_EMAIL_LEN = 256;
const MAX_SUBJECT_LEN = 128;
const MAX_MESSAGE_LEN = 4000;
const MIN_MESSAGE_LEN = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeInput(input: string): string {
  return input.trim().replace(/\r\n?/g, "\n");
}

function validateContactPayload(
  body: Record<string, unknown>,
): { name: string; email: string; subject: string; message: string } | NextResponse {
  const rawName = typeof body.name === "string" ? body.name : "";
  const rawEmail = typeof body.email === "string" ? body.email : "";
  const rawSubject = typeof body.subject === "string" ? body.subject : "";
  const rawMessage = typeof body.message === "string" ? body.message : "";

  const name = sanitizeInput(rawName);
  const email = sanitizeInput(rawEmail).toLowerCase();
  const subject = sanitizeInput(rawSubject);
  const message = sanitizeInput(rawMessage);

  if (!email || !EMAIL_RE.test(email) || email.length > MAX_EMAIL_LEN) {
    return apiError(400, "Please provide a valid email address.");
  }

  if (name.length > MAX_NAME_LEN) {
    return apiError(400, "Name is too long.");
  }

  if (subject.length > MAX_SUBJECT_LEN) {
    return apiError(400, "Subject is too long.");
  }

  if (message.length < MIN_MESSAGE_LEN) {
    return apiError(400, "Message must be at least 10 characters.");
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return apiError(400, "Message is too long.");
  }

  return { name, email, subject, message };
}

/**
 * POST /api/contact
 * Public contact form endpoint. Writes submissions to the contact_submissions
 * table for the resolved site. Rate-limited per IP to prevent abuse.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request) ?? "unknown";
  const rl = await checkRateLimit(`contact:${clientIp}`, {
    maxRequests: 5,
    windowMs: 60_000,
    failPolicy: "grace" as const,
  });
  if (!rl.allowed) {
    return apiError(429, "Too many contact attempts. Please try again later.");
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const validation = validateContactPayload(bodyOrError as Record<string, unknown>);
  if (validation instanceof NextResponse) return validation;

  let site;
  try {
    site = await getCurrentSite();
  } catch (err) {
    captureException(err, { context: "[api/contact] getCurrentSite failed" });
    return apiError(500, "Unable to resolve site.");
  }

  try {
    const sb = await getTenantClient();
    // eslint-disable-next-line no-restricted-syntax -- public insert scoped by RLS to the JWT site_id claim
    const { error } = await sb.from("contact_submissions").insert({
      site_id: site.id,
      name: validation.name || null,
      email: validation.email,
      subject: validation.subject || null,
      message: validation.message,
    });

    if (error) {
      captureException(error, { context: "[api/contact] insert failed" });
      return apiError(500, "Failed to send message. Please try again later.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/contact] unexpected error" });
    return apiError(500, "Internal server error");
  }
}

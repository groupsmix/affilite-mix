import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * POST /api/csp-report — CSP violation report endpoint
 * F-032: Receives CSP violation reports and forwards to Sentry for analysis
 */
const CSP_REPORT_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  // F-06: Per-IP rate limit — documented in csrf-exempt-registry as
  // "cspReportBucket" but was not enforced at runtime. Without this,
  // bot traffic can flood the endpoint and inflate Sentry event volume.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`csp-report:${ip}`, CSP_REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  // CSP reports can be sent as JSON or multipart
  let report: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/csp-report")) {
      report = await request.json();
    } else if (contentType.includes("application/json")) {
      report = await request.json();
    } else {
      // Try JSON anyway
      report = await request.json();
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Extract violation details
  const violation = (report as { "csp-report"?: Record<string, unknown> })["csp-report"];

  if (violation) {
    // Forward to Sentry as a non-crashing event for analysis
    //
    // A41.6: CSP reports can leak sensitive data:
    // - blocked-uri may contain full URLs with query-string tokens
    // - script-sample may contain inline script source with nonces/secrets
    // Truncate both to origin+path only (strip query/fragment) and cap length.
    const sanitizeUri = (val: unknown): string | undefined => {
      if (typeof val !== "string") return undefined;
      return val.replace(/[\?#].*$/, "").slice(0, 200);
    };

    captureException(new Error("CSP Violation"), {
      tags: { csp_violation: true },
      level: "warning" as const,
      contexts: {
        csp_violation: {
          // Strip PII from document URL
          document_url: sanitizeUri(violation.document_uri ?? violation["document-uri"]),
          violated_directive: violation["violated-directive"],
          // A41.6: Strip query strings and cap length on blocked-uri
          blocked_uri: sanitizeUri(violation["blocked-uri"]),
          original_policy:
            typeof violation["original-policy"] === "string"
              ? (violation["original-policy"] as string).slice(0, 500)
              : undefined,
          referrer: sanitizeUri(violation.referrer),
          // A41.6: Truncate script-sample to 80 chars to avoid leaking
          // inline script source that may contain nonces or tokens
          script_sample:
            typeof violation["script-sample"] === "string"
              ? (violation["script-sample"] as string).slice(0, 80)
              : undefined,
        },
      },
    });
  }

  // Always return 204 No Content per CSP spec
  return new NextResponse(null, { status: 204 });
}
